/**
 * Domain service for POST /api/v1/inspections/{inspectionId}/sync.
 *
 * Accepts the pre-validated sync command, merges each mutation patch with the
 * current canonical snapshot, recomputes visibility and smart-pruning, and
 * either returns the current state unchanged (no-op) or calls the single
 * atomic SQL function `public.save_inspection_snapshot`.
 *
 * Returns a discriminated-union result so the HTTP handler can return either
 * a 200 success envelope or a 409 SYNC_CONFLICT envelope without throwing.
 *
 * Throws H3 `createError` for all non-conflict HTTP errors (401, 404, 409
 * INSPECTION_NOT_EDITABLE, 422, 500).
 */

import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { Tables } from "~/db/database.types";
import type { InspectionPart1Dto, InspectionRuntimeFlagsDto } from "~/types";
import type {
  SyncInspectionCommand,
  SyncInspectionResult,
  SyncedInspection,
} from "../../../shared/contracts/inspections";
import { PutInspectionPart1CommandSchema } from "../../../shared/contracts/inspections";
import {
  extractSnapshotFields,
  buildPart1,
  buildRuntimeFlags,
  computeProgress,
  computeScoreDistribution,
} from "./inspection-snapshot";
import type { SnapshotSourceRow } from "./inspection-snapshot";
import { resolveVisibility, applySmartPruning } from "./inspection-visibility";
import type { PutInspectionPart1Command } from "../../../shared/contracts/inspections";
import {
  upsertQuestionNoteInDocument,
  removeQuestionNoteFromDocument,
} from "./inspection-note-document";
import { buildInspectionTitle } from "./save-inspection-part1";
import { QUESTION_TEXT_BY_ID } from "../question-bank";

// ── Internal row type ──────────────────────────────────────────────────────

type SyncFetchRow = SnapshotSourceRow &
  Pick<
    Tables<"inspections">,
    | "id"
    | "title"
    | "status"
    | "snapshot_version"
    | "client_updated_at"
    | "updated_at"
    | "user_id"
  >;

// ── RPC row shape ──────────────────────────────────────────────────────────

interface SaveSnapshotRpcRow {
  id: string;
  title: string;
  status: string;
  snapshot_version: number;
  client_updated_at: string;
  updated_at: string;
}

// ── Discriminated-union return ─────────────────────────────────────────────

export interface SyncInspectionSuccess {
  type: "success";
  result: SyncInspectionResult;
}

export interface SyncInspectionConflict {
  type: "conflict";
  canonicalId: string;
  canonicalSnapshotVersion: number;
  canonicalClientUpdatedAt: string;
}

export type SyncInspectionServiceResult =
  | SyncInspectionSuccess
  | SyncInspectionConflict;

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Builds the canonical JSONB snapshot object expected by the DB column.
 * Top-level keys are snake_case; nested Part 1 and runtime_flags keys are
 * camelCase to match the shape created by `save_inspection_part1` and
 * `save_inspection_runtime_flags`.
 */
function buildSnapshotPayload(
  part1: InspectionPart1Dto | null,
  runtimeFlags: InspectionRuntimeFlagsDto,
  answers: Record<string, string>,
  questionNotes: Record<string, string>,
  globalNotes: string,
  visibleGroupIds: string[],
  visibleQuestionIds: string[],
): Record<string, unknown> {
  const part1Json = part1
    ? {
        price: part1.price,
        make: part1.make,
        model: part1.model,
        yearOfProduction: part1.yearOfProduction,
        registrationNumber: part1.registrationNumber,
        vinNumber: part1.vinNumber,
        mileage: part1.mileage,
        fuelType: part1.fuelType,
        transmission: part1.transmission,
        drive: part1.drive,
        color: part1.color,
        bodyType: part1.bodyType,
        numberOfDoors: part1.numberOfDoors,
        address: part1.address,
        notes: part1.notes,
      }
    : null;

  return {
    part_1: part1Json,
    runtime_flags: {
      chargingPortEquipped: runtimeFlags.chargingPortEquipped,
      evBatteryDocsAvailable: runtimeFlags.evBatteryDocsAvailable,
      turboEquipped: runtimeFlags.turboEquipped,
      mechanicalCompressorEquipped: runtimeFlags.mechanicalCompressorEquipped,
      importedFromEU: runtimeFlags.importedFromEU,
    },
    answers,
    question_notes: questionNotes,
    global_notes: globalNotes,
    visible_group_ids: visibleGroupIds,
    visible_question_ids: visibleQuestionIds,
  };
}

/** Compares two plain-object maps by serialising to sorted-key JSON. */
function mapsEqual(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const sortedA = Object.fromEntries(Object.entries(a).sort());
  const sortedB = Object.fromEntries(Object.entries(b).sort());
  return JSON.stringify(sortedA) === JSON.stringify(sortedB);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Returns `true` when no field in the merged state differs from the current row. */
function detectNoOp(
  row: SyncFetchRow,
  currentPart1: InspectionPart1Dto | null,
  currentRuntimeFlags: InspectionRuntimeFlagsDto,
  currentAnswers: Record<string, string>,
  currentQuestionNotes: Record<string, string>,
  currentGlobalNotes: string,
  currentVisibleGroupIds: string[],
  currentVisibleQuestionIds: string[],
  mergedPart1: InspectionPart1Dto | null,
  mergedRuntimeFlags: InspectionRuntimeFlagsDto,
  mergedAnswers: Record<string, string>,
  mergedQuestionNotes: Record<string, string>,
  mergedGlobalNotes: string,
  newVisibleGroupIds: string[],
  newVisibleQuestionIds: string[],
  newTitle: string,
): boolean {
  if (row.title !== newTitle) return false;

  // Part 1 null-equality
  if ((currentPart1 === null) !== (mergedPart1 === null)) return false;
  if (
    currentPart1 !== null &&
    mergedPart1 !== null &&
    JSON.stringify(currentPart1) !== JSON.stringify(mergedPart1)
  ) {
    return false;
  }

  // Runtime flags
  if (
    JSON.stringify(currentRuntimeFlags) !== JSON.stringify(mergedRuntimeFlags)
  )
    return false;

  // Maps
  if (!mapsEqual(currentAnswers, mergedAnswers)) return false;
  if (!mapsEqual(currentQuestionNotes, mergedQuestionNotes)) return false;

  // Global notes (string equality)
  if (currentGlobalNotes !== mergedGlobalNotes) return false;

  // Visibility arrays (order matters)
  if (!arraysEqual(currentVisibleGroupIds, newVisibleGroupIds)) return false;
  if (!arraysEqual(currentVisibleQuestionIds, newVisibleQuestionIds))
    return false;

  return true;
}

/** Builds `SyncedInspection` from in-memory merged state + RPC-returned fields. */
function buildSyncedInspection(
  id: string,
  title: string,
  status: string,
  snapshotVersion: number,
  clientUpdatedAt: string,
  updatedAt: string,
  part1: InspectionPart1Dto | null,
  runtimeFlags: InspectionRuntimeFlagsDto,
  answers: Record<string, string>,
  questionNotes: Record<string, string>,
  globalNotes: string,
  visibleGroupIds: string[],
  visibleQuestionIds: string[],
): SyncedInspection {
  const progress = computeProgress(answers, visibleQuestionIds);
  const scoreDistribution = computeScoreDistribution(
    answers,
    visibleQuestionIds,
  );
  const mode = status === "completed" ? "report" : "editable";

  return {
    id,
    title,
    status: status as "draft" | "completed",
    snapshotVersion,
    clientUpdatedAt,
    updatedAt,
    part1: part1 ?? null,
    runtimeFlags,
    answers: answers as Record<string, "yes" | "no" | "dont_know">,
    questionNotes,
    globalNotes,
    visibleGroupIds,
    visibleQuestionIds,
    progress,
    scoreDistribution,
    mode: mode as "editable" | "report",
  };
}

// ── Error classifiers ──────────────────────────────────────────────────────

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return msg.includes("NOT_FOUND") || hint.includes("NOT_FOUND");
}

function isSnapshotConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return (
    msg.includes("SNAPSHOT_CONFLICT") || hint.includes("SNAPSHOT_CONFLICT")
  );
}

function isInspectionCompletedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return (
    msg.includes("INSPECTION_COMPLETED") ||
    hint.includes("INSPECTION_COMPLETED")
  );
}

// ── Main service ───────────────────────────────────────────────────────────

/**
 * Executes the offline-first sync for a single inspection.
 *
 * @returns A discriminated-union result:
 *   - `{ type: 'success', result }` on a clean sync or no-op.
 *   - `{ type: 'conflict', canonicalId, ... }` when the base snapshot version
 *     is outdated (either detected pre-SQL or via a race condition in SQL).
 * @throws H3 `createError` for 404, 409 INSPECTION_NOT_EDITABLE, 422, 500.
 */
export async function syncInspection(
  event: H3Event,
  userId: string,
  inspectionId: string,
  command: SyncInspectionCommand,
  requestId: string,
): Promise<SyncInspectionServiceResult> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current inspection row ────────────────────────────────────
  const { data: rawRow, error: fetchError } = await client
    .from("inspections")
    .select(
      "id, title, status, snapshot, snapshot_version, client_updated_at, updated_at, user_id, " +
        "make, model, fuel_type, transmission, drive, body_type, " +
        "price, year_of_production, registration_number, vin_number, mileage, color, number_of_doors, address",
    )
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[sync-inspection] snapshot fetch failed", {
      endpoint: "POST /api/v1/inspections/:inspectionId/sync",
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

  if (!rawRow) {
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message: "The requested inspection was not found.",
    });
  }

  const row = rawRow as unknown as SyncFetchRow;

  // ── 2. Status guard ─────────────────────────────────────────────────────
  if (row.status === "completed") {
    throw createError({
      statusCode: 409,
      statusMessage: "Conflict",
      data: { code: "INSPECTION_NOT_EDITABLE" },
      message:
        "The inspection is completed and cannot be synced. Reopen it first.",
    });
  }

  // ── 3. Pre-SQL conflict check (fast-path) ───────────────────────────────
  if (command.baseSnapshotVersion !== row.snapshot_version) {
    return {
      type: "conflict",
      canonicalId: row.id,
      canonicalSnapshotVersion: row.snapshot_version,
      canonicalClientUpdatedAt: row.client_updated_at,
    };
  }

  // ── 4. Extract current canonical state ─────────────────────────────────
  const snapshotFields = extractSnapshotFields(row.snapshot);
  const currentPart1 = buildPart1(row);
  const currentRuntimeFlags = buildRuntimeFlags(snapshotFields.runtimeFlags);
  const currentAnswers = snapshotFields.answers;
  const currentQuestionNotes = snapshotFields.questionNotes;
  const currentGlobalNotes = snapshotFields.globalNotes;
  const currentVisibleGroupIds = snapshotFields.visibleGroupIds;
  const currentVisibleQuestionIds = snapshotFields.visibleQuestionIds;

  // ── 5. Merge Part 1 patch (if present) ─────────────────────────────────
  let mergedPart1: InspectionPart1Dto | null = currentPart1;
  let validatedPart1ForVisibility: PutInspectionPart1Command | null = null;
  let updatePart1 = false;

  if (currentPart1 !== null) {
    // Use existing Part 1 as base for visibility even without a patch
    validatedPart1ForVisibility =
      currentPart1 as unknown as PutInspectionPart1Command;
  }

  if (command.mutation.part1 !== undefined) {
    const base: Record<string, unknown> = currentPart1
      ? { ...currentPart1 }
      : {};
    const rawMerge = { ...base, ...command.mutation.part1 };
    const parseResult = PutInspectionPart1CommandSchema.safeParse(rawMerge);

    if (!parseResult.success) {
      const details = parseResult.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      throw createError({
        statusCode: 422,
        statusMessage: "Unprocessable Entity",
        data: { code: "VALIDATION_ERROR", details },
        message:
          "Part 1 patch failed validation after merging with existing data.",
      });
    }

    mergedPart1 = parseResult.data as unknown as InspectionPart1Dto;
    validatedPart1ForVisibility = parseResult.data;
    updatePart1 = true;
  }

  // ── 6. Merge runtime flags (if present) ────────────────────────────────
  let mergedRuntimeFlags: InspectionRuntimeFlagsDto = currentRuntimeFlags;
  if (command.mutation.runtimeFlags !== undefined) {
    mergedRuntimeFlags = {
      ...currentRuntimeFlags,
      ...Object.fromEntries(
        Object.entries(command.mutation.runtimeFlags).filter(
          ([, v]) => v !== undefined,
        ),
      ),
    } as InspectionRuntimeFlagsDto;
  }

  // ── 7. Merge answers (if present) ──────────────────────────────────────
  let mergedAnswers: Record<string, string> = { ...currentAnswers };
  if (command.mutation.answers !== undefined) {
    mergedAnswers = { ...mergedAnswers, ...command.mutation.answers };
  }

  // ── 8. Merge question notes + one-way mirroring (if present) ───────────
  let mergedQuestionNotes: Record<string, string> = { ...currentQuestionNotes };
  let mergedGlobalNotes = currentGlobalNotes;

  if (command.mutation.questionNotes !== undefined) {
    for (const [qId, note] of Object.entries(command.mutation.questionNotes)) {
      mergedQuestionNotes[qId] = note;
      // Mirror into global notes — one-way only.
      const label = QUESTION_TEXT_BY_ID.get(qId) ?? qId;
      mergedGlobalNotes = upsertQuestionNoteInDocument(
        mergedGlobalNotes,
        qId,
        label,
        note,
      );
    }
  }

  // ── 9. Global notes (full replacement, overrides mirroring when present) ─
  if (command.mutation.globalNotes !== undefined) {
    mergedGlobalNotes = command.mutation.globalNotes;
  }

  // ── 10. Resolve visibility ──────────────────────────────────────────────
  let newVisibleGroupIds: string[] = currentVisibleGroupIds;
  let newVisibleQuestionIds: string[] = currentVisibleQuestionIds;

  if (
    validatedPart1ForVisibility !== null &&
    (updatePart1 || command.mutation.runtimeFlags !== undefined)
  ) {
    const vis = resolveVisibility(
      validatedPart1ForVisibility,
      mergedRuntimeFlags,
    );
    newVisibleGroupIds = vis.visibleGroupIds;
    newVisibleQuestionIds = vis.visibleQuestionIds;
  } else if (validatedPart1ForVisibility === null) {
    // No Part 1 data available — no questions visible.
    newVisibleGroupIds = [];
    newVisibleQuestionIds = [];
  }

  // ── 11. Smart pruning ───────────────────────────────────────────────────
  const smartPruning = applySmartPruning(
    mergedAnswers,
    mergedQuestionNotes,
    newVisibleQuestionIds,
  );

  // Apply pruning to merged maps.
  for (const qId of smartPruning.removedAnswerIds) {
    delete mergedAnswers[qId];
  }
  for (const qId of smartPruning.removedQuestionNoteIds) {
    delete mergedQuestionNotes[qId];
    // Remove the managed section for pruned notes from global notes.
    mergedGlobalNotes = removeQuestionNoteFromDocument(mergedGlobalNotes, qId);
  }

  // ── 12. Determine new title ─────────────────────────────────────────────
  const newTitle =
    updatePart1 && mergedPart1 !== null
      ? buildInspectionTitle(
          mergedPart1 as unknown as PutInspectionPart1Command,
        )
      : row.title;

  // ── 13. No-op detection ─────────────────────────────────────────────────
  const isNoOp = detectNoOp(
    row,
    currentPart1,
    currentRuntimeFlags,
    currentAnswers,
    currentQuestionNotes,
    currentGlobalNotes,
    currentVisibleGroupIds,
    currentVisibleQuestionIds,
    mergedPart1,
    mergedRuntimeFlags,
    mergedAnswers,
    mergedQuestionNotes,
    mergedGlobalNotes,
    newVisibleGroupIds,
    newVisibleQuestionIds,
    newTitle,
  );

  if (isNoOp) {
    const inspection = buildSyncedInspection(
      row.id,
      row.title,
      row.status,
      row.snapshot_version,
      row.client_updated_at,
      row.updated_at,
      currentPart1,
      currentRuntimeFlags,
      currentAnswers,
      currentQuestionNotes,
      currentGlobalNotes,
      currentVisibleGroupIds,
      currentVisibleQuestionIds,
    );
    return {
      type: "success",
      result: {
        inspection,
        conflict: { detected: false, resolvedWith: "client_wins" },
        smartPruning: {
          applied: false,
          removedAnswerIds: [],
          removedQuestionNoteIds: [],
        },
      },
    };
  }

  // ── 14. Build canonical snapshot for SQL ───────────────────────────────
  const newSnapshotPayload = buildSnapshotPayload(
    mergedPart1,
    mergedRuntimeFlags,
    mergedAnswers,
    mergedQuestionNotes,
    mergedGlobalNotes,
    newVisibleGroupIds,
    newVisibleQuestionIds,
  );

  // ── 15. Call atomic SQL function ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "save_inspection_snapshot",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_base_snapshot_version: command.baseSnapshotVersion,
      p_client_updated_at: command.clientUpdatedAt,
      p_new_snapshot: newSnapshotPayload,
      p_update_part1: updatePart1,
      p_title: updatePart1 ? newTitle : null,
      p_make: updatePart1 ? (mergedPart1?.make ?? null) : null,
      p_model: updatePart1 ? (mergedPart1?.model ?? null) : null,
      p_fuel_type: updatePart1 ? (mergedPart1?.fuelType ?? null) : null,
      p_transmission: updatePart1 ? (mergedPart1?.transmission ?? null) : null,
      p_drive: updatePart1 ? (mergedPart1?.drive ?? null) : null,
      p_body_type: updatePart1 ? (mergedPart1?.bodyType ?? null) : null,
      p_price: updatePart1 ? (mergedPart1?.price ?? null) : null,
      p_year_of_production: updatePart1
        ? (mergedPart1?.yearOfProduction ?? null)
        : null,
      p_mileage: updatePart1 ? (mergedPart1?.mileage ?? null) : null,
      p_number_of_doors: updatePart1
        ? (mergedPart1?.numberOfDoors ?? null)
        : null,
      p_registration_number: updatePart1
        ? (mergedPart1?.registrationNumber ?? null)
        : null,
      p_vin_number: updatePart1 ? (mergedPart1?.vinNumber ?? null) : null,
      p_color: updatePart1 ? (mergedPart1?.color ?? null) : null,
      p_address: updatePart1 ? (mergedPart1?.address ?? null) : null,
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

    if (isInspectionCompletedError(rpcError)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Conflict",
        data: { code: "INSPECTION_NOT_EDITABLE" },
        message:
          "The inspection is completed and cannot be synced. Reopen it first.",
      });
    }

    if (isSnapshotConflictError(rpcError)) {
      // Race condition: a concurrent write landed between our pre-check and SQL.
      // Re-fetch to get the accurate canonical version for the conflict response.
      const { data: freshRow } = await client
        .from("inspections")
        .select("id, snapshot_version, client_updated_at")
        .eq("id", inspectionId)
        .eq("user_id", userId)
        .maybeSingle();

      return {
        type: "conflict",
        canonicalId: freshRow?.id ?? inspectionId,
        canonicalSnapshotVersion:
          (freshRow as { snapshot_version?: number } | null)
            ?.snapshot_version ?? row.snapshot_version + 1,
        canonicalClientUpdatedAt:
          (freshRow as { client_updated_at?: string } | null)
            ?.client_updated_at ?? row.client_updated_at,
      };
    }

    console.error("[sync-inspection] rpc call failed", {
      endpoint: "POST /api/v1/inspections/:inspectionId/sync",
      requestId,
      userId,
      inspectionId,
      baseSnapshotVersion: command.baseSnapshotVersion,
      updatePart1,
      removedAnswers: smartPruning.removedAnswerIds.length,
      removedNotes: smartPruning.removedQuestionNoteIds.length,
      errorMessage: (rpcError as { message?: string }).message,
      errorCode: (rpcError as { code?: string }).code,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const rows = rpcData as SaveSnapshotRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[sync-inspection] rpc returned no rows", {
      endpoint: "POST /api/v1/inspections/:inspectionId/sync",
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

  // ── 16. Build and return success result ─────────────────────────────────
  const inspection = buildSyncedInspection(
    savedRow.id,
    savedRow.title,
    savedRow.status,
    savedRow.snapshot_version,
    savedRow.client_updated_at,
    savedRow.updated_at,
    mergedPart1,
    mergedRuntimeFlags,
    mergedAnswers,
    mergedQuestionNotes,
    mergedGlobalNotes,
    newVisibleGroupIds,
    newVisibleQuestionIds,
  );

  return {
    type: "success",
    result: {
      inspection,
      conflict: { detected: false, resolvedWith: "client_wins" },
      smartPruning,
    },
  };
}
