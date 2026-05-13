import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import { QUESTION_TEXT_BY_ID } from "../question-bank";
import { removeQuestionNoteFromDocument } from "./inspection-note-document";
import type { DeleteInspectionQuestionNoteResult } from "../../../shared/contracts/inspections";

// ── Internal types ──────────────────────────────────────────────────────────

interface FetchedInspection {
  status: string;
  snapshot_version: number;
  snapshot: Record<string, unknown>;
}

interface DeleteQuestionNoteRpcRow {
  snapshot_version: number;
}

// ── Helper ──────────────────────────────────────────────────────────────────

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return msg.includes("NOT_FOUND") || hint.includes("NOT_FOUND");
}

// ── Main service function ────────────────────────────────────────────────────

/**
 * Removes a single question note from the inspection snapshot and
 * simultaneously updates snapshot.global_notes to remove the mirrored section.
 *
 * Guards:
 * - `404` when the inspection does not exist or belongs to a different user.
 * - `404` when the question is not visible or has no stored note (avoids
 *   leaking question set state while making missing-note visible to the client).
 * - `409` when inspection status is `completed`.
 *
 * The `client_updated_at` column is set to the server transaction timestamp
 * by the SQL function because the DELETE contract carries no client timestamp.
 *
 * NOTE: RLS is disabled on public.inspections; the service-role client plus
 * explicit `user_id` filter enforce ownership.
 */
export async function deleteInspectionQuestionNote(
  event: H3Event,
  userId: string,
  inspectionId: string,
  questionId: string,
  requestId: string,
): Promise<DeleteInspectionQuestionNoteResult> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current inspection row ────────────────────────────────────
  const { data: existing, error: fetchError } = await client
    .from("inspections")
    .select("status, snapshot_version, snapshot")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[delete-inspection-question-note] snapshot fetch failed", {
      endpoint:
        "DELETE /api/v1/inspections/:inspectionId/question-notes/:questionId",
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

  // ── 3. Extract snapshot fields ──────────────────────────────────────────
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

  // ── 4. Visibility and existence guard ───────────────────────────────────
  // Both cases return 404 to avoid leaking details about the question set.
  if (
    !visibleQuestionIds.includes(questionId) ||
    !(questionId in currentQuestionNotes)
  ) {
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message:
        "The note was not found or the question is not part of the current visible question set.",
    });
  }

  // ── 5. Resolve question label for consistent global_notes cleanup ───────
  // If the bank label is missing for a visible question, log but continue —
  // we can still remove the sentinel-delimited section by questionId alone.
  const questionLabel = QUESTION_TEXT_BY_ID.get(questionId);
  if (!questionLabel) {
    console.error(
      "[delete-inspection-question-note] visible question missing from bank",
      {
        endpoint:
          "DELETE /api/v1/inspections/:inspectionId/question-notes/:questionId",
        requestId,
        userId,
        inspectionId,
        questionId,
      },
    );
  }

  // ── 6. Compute new global_notes by removing the managed section ─────────
  const newGlobalNotes = removeQuestionNoteFromDocument(
    currentGlobalNotes,
    questionId,
  );

  // ── 7. Persist via SQL RPC ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "delete_inspection_question_note",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_question_id: questionId,
      p_global_notes: newGlobalNotes,
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

    console.error("[delete-inspection-question-note] rpc call failed", {
      endpoint:
        "DELETE /api/v1/inspections/:inspectionId/question-notes/:questionId",
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

  const rows = rpcData as DeleteQuestionNoteRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[delete-inspection-question-note] rpc returned no rows", {
      endpoint:
        "DELETE /api/v1/inspections/:inspectionId/question-notes/:questionId",
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
    deleted: true,
    snapshotVersion: rows[0].snapshot_version,
  };
}
