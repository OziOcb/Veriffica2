import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import { QUESTION_TEXT_BY_ID } from "../question-bank";
import { upsertQuestionNoteInDocument } from "./inspection-note-document";
import type {
  PutInspectionQuestionNoteCommand,
  PutInspectionQuestionNoteResult,
} from "../../../shared/contracts/inspections";

// ── Internal types ──────────────────────────────────────────────────────────

interface FetchedInspection {
  status: string;
  snapshot_version: number;
  snapshot: Record<string, unknown>;
}

interface SaveQuestionNoteRpcRow {
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
 * Saves or replaces a single question note in the inspection snapshot, and
 * simultaneously updates snapshot.global_notes via one-way mirroring.
 *
 * Guards:
 * - `404` when the inspection does not exist or belongs to a different user.
 * - `409` when status is `completed` or `baseSnapshotVersion` is stale.
 * - `422` when `questionId` is not in the current visible question set.
 * - `500` when `questionId` is visible but has no label in the question bank
 *   (invariant failure — the bank is out of sync).
 *
 * No-op: when both the stored note and the resulting global_notes would be
 * identical, returns the current `snapshotVersion` without calling the RPC.
 *
 * NOTE: RLS is disabled on public.inspections; the service-role client plus
 * explicit `user_id` filter enforce ownership.
 */
export async function saveInspectionQuestionNote(
  event: H3Event,
  userId: string,
  inspectionId: string,
  questionId: string,
  command: PutInspectionQuestionNoteCommand,
  requestId: string,
): Promise<PutInspectionQuestionNoteResult> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current inspection row ────────────────────────────────────
  const { data: existing, error: fetchError } = await client
    .from("inspections")
    .select("status, snapshot_version, snapshot")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[save-inspection-question-note] snapshot fetch failed", {
      endpoint:
        "PUT /api/v1/inspections/:inspectionId/question-notes/:questionId",
      requestId,
      userId,
      inspectionId,
      questionId,
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

  // ── 4. Extract snapshot fields ──────────────────────────────────────────
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;

  const visibleQuestionIdsRaw = snapshot["visible_question_ids"];
  const visibleQuestionIds: string[] = Array.isArray(visibleQuestionIdsRaw)
    ? visibleQuestionIdsRaw.filter((v): v is string => typeof v === "string")
    : [];

  const questionNotesRaw = snapshot["question_notes"];
  const currentQuestionNotes: Record<string, string> =
    typeof questionNotesRaw === "object" &&
    questionNotesRaw !== null &&
    !Array.isArray(questionNotesRaw)
      ? (questionNotesRaw as Record<string, string>)
      : {};

  const currentGlobalNotes: string =
    typeof snapshot["global_notes"] === "string"
      ? snapshot["global_notes"]
      : "";

  // ── 5. Visibility guard ─────────────────────────────────────────────────
  if (!visibleQuestionIds.includes(questionId)) {
    throw createError({
      statusCode: 422,
      statusMessage: "Unprocessable Entity",
      data: { code: "QUESTION_NOT_VISIBLE" },
      message:
        "The question is not part of the current visible question set for this inspection.",
    });
  }

  // ── 6. Resolve question label (bank invariant check) ───────────────────
  const questionLabel = QUESTION_TEXT_BY_ID.get(questionId);
  if (!questionLabel) {
    console.error(
      "[save-inspection-question-note] visible question missing from bank",
      {
        endpoint:
          "PUT /api/v1/inspections/:inspectionId/question-notes/:questionId",
        requestId,
        userId,
        inspectionId,
        questionId,
      },
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      data: { code: "QUESTION_BANK_INVARIANT_BROKEN" },
      message: "An unexpected error occurred while processing the request.",
    });
  }

  // ── 7. Compute new global_notes via one-way mirroring ──────────────────
  const newGlobalNotes = upsertQuestionNoteInDocument(
    currentGlobalNotes,
    questionId,
    questionLabel,
    command.note,
  );

  // ── 8. No-op short-circuit ──────────────────────────────────────────────
  if (
    currentQuestionNotes[questionId] === command.note &&
    currentGlobalNotes === newGlobalNotes
  ) {
    return {
      inspectionId,
      questionId,
      questionNote: command.note,
      globalNotes: currentGlobalNotes,
      snapshotVersion: row.snapshot_version,
    };
  }

  // ── 9. Persist via SQL RPC ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "save_inspection_question_note",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_question_id: questionId,
      p_note: command.note,
      p_global_notes: newGlobalNotes,
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

    console.error("[save-inspection-question-note] rpc call failed", {
      endpoint:
        "PUT /api/v1/inspections/:inspectionId/question-notes/:questionId",
      requestId,
      userId,
      inspectionId,
      questionId,
      errorMessage: rpcError.message,
      errorCode: (rpcError as { code?: string }).code,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const rows = rpcData as SaveQuestionNoteRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[save-inspection-question-note] rpc returned no rows", {
      endpoint:
        "PUT /api/v1/inspections/:inspectionId/question-notes/:questionId",
      requestId,
      userId,
      inspectionId,
      questionId,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  return {
    inspectionId,
    questionId,
    questionNote: command.note,
    globalNotes: newGlobalNotes,
    snapshotVersion: rows[0].snapshot_version,
  };
}
