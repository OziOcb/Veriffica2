import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import type {
  PutInspectionGlobalNotesCommand,
  PutInspectionGlobalNotesResult,
} from "../../../shared/contracts/inspections";

// ── Internal types ──────────────────────────────────────────────────────────

interface FetchedInspection {
  status: string;
  snapshot_version: number;
  snapshot: Record<string, unknown>;
}

interface SaveGlobalNotesRpcRow {
  snapshot_version: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Main service function ────────────────────────────────────────────────────

/**
 * Replaces the global notes document in the inspection snapshot.
 *
 * Guards:
 * - `404` when the inspection does not exist or belongs to a different user.
 * - `409` when status is `completed` or `baseSnapshotVersion` is stale.
 *
 * No-op: when the new document is identical to the current `global_notes`,
 * returns the current `snapshotVersion` without calling the RPC.
 *
 * IMPORTANT: this service must never read or infer `question_notes` from the
 * free-text document. `snapshot.question_notes` is left untouched by the RPC.
 *
 * NOTE: RLS is disabled on public.inspections; the service-role client plus
 * explicit `user_id` filter enforce ownership.
 */
export async function saveInspectionGlobalNotes(
  event: H3Event,
  userId: string,
  inspectionId: string,
  command: PutInspectionGlobalNotesCommand,
  requestId: string,
): Promise<PutInspectionGlobalNotesResult> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current inspection row ────────────────────────────────────
  const { data: existing, error: fetchError } = await client
    .from("inspections")
    .select("status, snapshot_version, snapshot")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[save-inspection-global-notes] snapshot fetch failed", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/global-notes",
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

  // ── 4. Extract current global_notes ────────────────────────────────────
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
  const currentGlobalNotes: string =
    typeof snapshot["global_notes"] === "string"
      ? snapshot["global_notes"]
      : "";

  // ── 5. No-op short-circuit ──────────────────────────────────────────────
  if (command.globalNotes === currentGlobalNotes) {
    return {
      inspectionId,
      globalNotes: currentGlobalNotes,
      snapshotVersion: row.snapshot_version,
    };
  }

  // ── 6. Persist via SQL RPC ──────────────────────────────────────────────
  // The RPC updates only global_notes; question_notes remains untouched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "save_inspection_global_notes",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_global_notes: command.globalNotes,
      p_base_snapshot_version: command.baseSnapshotVersion,
      p_client_updated_at: command.clientUpdatedAt,
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

    if (isSnapshotConflictError(rpcError)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Conflict",
        data: { code: "SNAPSHOT_CONFLICT" },
        message:
          "The snapshot version is outdated. Refresh the inspection and retry.",
      });
    }

    console.error("[save-inspection-global-notes] rpc call failed", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/global-notes",
      requestId,
      userId,
      inspectionId,
      errorMessage: rpcError.message,
      errorCode: (rpcError as { code?: string }).code,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const rows = rpcData as SaveGlobalNotesRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[save-inspection-global-notes] rpc returned no rows", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/global-notes",
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

  return {
    inspectionId,
    globalNotes: command.globalNotes,
    snapshotVersion: rows[0].snapshot_version,
  };
}
