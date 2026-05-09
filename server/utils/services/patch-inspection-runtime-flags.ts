import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { InspectionRuntimeFlagsDto } from "~/types";
import type {
  PatchInspectionRuntimeFlagsCommand,
  PatchInspectionRuntimeFlagsResult,
  PutInspectionPart1Command,
} from "../../../shared/contracts/inspections";
import { resolveVisibility, applySmartPruning } from "./inspection-visibility";

// ── Internal types ──────────────────────────────────────────────────────────

interface FetchedInspection {
  status: string;
  snapshot_version: number;
  snapshot: Record<string, unknown>;
  client_updated_at: string;
}

/**
 * Raw row shape returned by the public.save_inspection_runtime_flags RPC.
 * Columns match the RETURNS TABLE definition in the SQL migration.
 */
interface SaveRuntimeFlagsRpcRow {
  snapshot_version: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return msg.includes("NOT_FOUND") || hint.includes("NOT_FOUND");
}

/** Normalizes raw snapshot runtime_flags, filling missing keys with `false`. */
function normalizeRuntimeFlags(raw: unknown): InspectionRuntimeFlagsDto {
  const flags = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    chargingPortEquipped: flags.chargingPortEquipped === true,
    evBatteryDocsAvailable: flags.evBatteryDocsAvailable === true,
    turboEquipped: flags.turboEquipped === true,
    mechanicalCompressorEquipped: flags.mechanicalCompressorEquipped === true,
    importedFromEU: flags.importedFromEU === true,
  };
}

/**
 * Returns true when two runtime flag objects are shallowly equal across all
 * five known flag keys.
 */
function runtimeFlagsEqual(
  a: InspectionRuntimeFlagsDto,
  b: InspectionRuntimeFlagsDto,
): boolean {
  return (
    a.chargingPortEquipped === b.chargingPortEquipped &&
    a.evBatteryDocsAvailable === b.evBatteryDocsAvailable &&
    a.turboEquipped === b.turboEquipped &&
    a.mechanicalCompressorEquipped === b.mechanicalCompressorEquipped &&
    a.importedFromEU === b.importedFromEU
  );
}

// ── Main service function ────────────────────────────────────────────────────

/**
 * Applies a partial runtime-flags patch to an existing inspection snapshot.
 *
 * In `preview` mode all computation runs but no database write occurs.
 * In `apply` mode with a no-op patch (flags identical after merge) the service
 * returns `200` without calling the SQL RPC and without bumping snapshotVersion.
 *
 * Throws H3 errors for:
 * - `404` when the inspection does not exist or belongs to a different user.
 * - `409` when the inspection status is `completed` or when `baseSnapshotVersion`
 *   does not match the current `snapshot_version`.
 * - `500` for unexpected database failures.
 */
export async function patchInspectionRuntimeFlags(
  event: H3Event,
  userId: string,
  inspectionId: string,
  command: PatchInspectionRuntimeFlagsCommand,
  mode: "preview" | "apply",
  requestId: string,
): Promise<PatchInspectionRuntimeFlagsResult> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current inspection row ────────────────────────────────────
  const { data: existing, error: fetchError } = await client
    .from("inspections")
    .select("status, snapshot_version, snapshot, client_updated_at")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[patch-inspection-runtime-flags] snapshot fetch failed", {
      endpoint: "PATCH /api/v1/inspections/:inspectionId/runtime-flags",
      requestId,
      userId,
      inspectionId,
      errorMessage: fetchError.message,
      errorCode: fetchError.code,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message: "The requested inspection was not found.",
    });
  }

  const row = existing as FetchedInspection;

  // ── 2. Status guard ─────────────────────────────────────────────────────
  if (row.status === "completed") {
    throw createError({
      statusCode: 409,
      statusMessage: "Conflict",
      data: { code: "INSPECTION_NOT_EDITABLE" },
      message:
        "The inspection is completed and cannot be edited. Reopen it first.",
    });
  }

  // ── 3. Optimistic concurrency check ────────────────────────────────────
  if (command.baseSnapshotVersion !== row.snapshot_version) {
    throw createError({
      statusCode: 409,
      statusMessage: "Conflict",
      data: { code: "SNAPSHOT_CONFLICT" },
      message:
        "The snapshot version is outdated. Refresh the inspection and retry.",
    });
  }

  // ── 4. Extract current state from snapshot ──────────────────────────────
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
  const currentRuntimeFlags = normalizeRuntimeFlags(snapshot.runtime_flags);
  const currentAnswers = (snapshot.answers ?? {}) as Record<string, string>;
  const currentQuestionNotes = (snapshot.question_notes ?? {}) as Record<
    string,
    string
  >;

  // ── 5. Merge patch into current flags ───────────────────────────────────
  const { baseSnapshotVersion: _omit, ...flagPatch } = command;
  const nextRuntimeFlags: InspectionRuntimeFlagsDto = {
    ...currentRuntimeFlags,
    ...Object.fromEntries(
      Object.entries(flagPatch).filter(([, v]) => v !== undefined),
    ),
  } as InspectionRuntimeFlagsDto;

  // ── 6. Resolve visibility ───────────────────────────────────────────────
  // If part_1 is missing the snapshot hasn't been initialized with vehicle
  // data yet, so visibility stays empty (no questions are visible).
  const part1Raw = snapshot.part_1 as
    | PutInspectionPart1Command
    | null
    | undefined;

  let visibleGroupIds: string[];
  let visibleQuestionIds: string[];

  if (part1Raw && typeof part1Raw === "object") {
    ({ visibleGroupIds, visibleQuestionIds } = resolveVisibility(
      part1Raw,
      nextRuntimeFlags,
    ));
  } else {
    visibleGroupIds = [];
    visibleQuestionIds = [];
  }

  // ── 7. Smart Pruning ────────────────────────────────────────────────────
  const pruning = applySmartPruning(
    currentAnswers,
    currentQuestionNotes,
    visibleQuestionIds,
  );

  // ── 8. preview mode: return computed result without persisting ──────────
  if (mode === "preview") {
    return {
      inspectionId,
      runtimeFlags: nextRuntimeFlags,
      visibleGroupIds,
      visibleQuestionIds,
      smartPruning: pruning,
      snapshotVersion: row.snapshot_version,
    };
  }

  // ── 9. no-op short-circuit ──────────────────────────────────────────────
  // If flags are identical and pruning has nothing to remove, skip the RPC.
  if (
    runtimeFlagsEqual(currentRuntimeFlags, nextRuntimeFlags) &&
    !pruning.applied
  ) {
    return {
      inspectionId,
      runtimeFlags: nextRuntimeFlags,
      visibleGroupIds,
      visibleQuestionIds,
      smartPruning: pruning,
      snapshotVersion: row.snapshot_version,
    };
  }

  // ── 10. Persist via SQL RPC ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "save_inspection_runtime_flags",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_base_snapshot_version: command.baseSnapshotVersion,
      p_runtime_flags: nextRuntimeFlags,
      p_visible_group_ids: visibleGroupIds,
      p_visible_question_ids: visibleQuestionIds,
      p_removed_answer_ids: pruning.removedAnswerIds,
      p_removed_question_note_ids: pruning.removedQuestionNoteIds,
      p_client_updated_at: new Date().toISOString(),
    },
  );

  if (rpcError) {
    if (isNotFoundError(rpcError)) {
      throw createError({
        statusCode: 404,
        statusMessage: "Not Found",
        message: "The requested inspection was not found.",
      });
    }

    console.error("[patch-inspection-runtime-flags] rpc call failed", {
      endpoint: "PATCH /api/v1/inspections/:inspectionId/runtime-flags",
      requestId,
      userId,
      inspectionId,
      mode,
      baseSnapshotVersion: command.baseSnapshotVersion,
      changedFlags: Object.keys(flagPatch),
      removedAnswers: pruning.removedAnswerIds.length,
      removedNotes: pruning.removedQuestionNoteIds.length,
      errorMessage: rpcError.message,
      errorCode: (rpcError as { code?: string }).code,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const rows = rpcData as SaveRuntimeFlagsRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[patch-inspection-runtime-flags] rpc returned no rows", {
      endpoint: "PATCH /api/v1/inspections/:inspectionId/runtime-flags",
      requestId,
      userId,
      inspectionId,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const savedRow = rows[0]!;

  return {
    inspectionId,
    runtimeFlags: nextRuntimeFlags,
    visibleGroupIds,
    visibleQuestionIds,
    smartPruning: pruning,
    snapshotVersion: savedRow.snapshot_version,
  };
}
