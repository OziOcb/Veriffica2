import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  computeProgress,
  computeScoreDistribution,
} from "./inspection-snapshot";
import type { DeleteInspectionAnswerResult } from "../../../shared/contracts/inspections";

// ── Internal types ──────────────────────────────────────────────────────────

interface FetchedInspection {
  status: string;
  snapshot_version: number;
  snapshot: Record<string, unknown>;
}

interface DeleteAnswerRpcRow {
  snapshot_version: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return msg.includes("NOT_FOUND") || hint.includes("NOT_FOUND");
}

// ── Main service function ────────────────────────────────────────────────────

/**
 * Removes a single answer entry from the inspection snapshot's answers map.
 *
 * Guards:
 * - `404` when the inspection does not exist or belongs to a different user.
 * - `404` when the answer does not exist or the question is not visible.
 * - `409` when inspection status is `completed`.
 *
 * A missing answer is treated as `404 Not Found` (not a silent no-op) because
 * the DELETE contract implies the resource must exist to be deleted.
 *
 * The `client_updated_at` column is set to the server transaction timestamp
 * by the SQL function because the DELETE contract carries no client timestamp.
 *
 * NOTE: RLS is disabled on public.inspections; the service-role client plus
 * explicit `user_id` filter enforce ownership.
 */
export async function deleteInspectionAnswer(
  event: H3Event,
  userId: string,
  inspectionId: string,
  questionId: string,
  requestId: string,
): Promise<DeleteInspectionAnswerResult> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current inspection row ────────────────────────────────────
  const { data: existing, error: fetchError } = await client
    .from("inspections")
    .select("status, snapshot_version, snapshot")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[delete-inspection-answer] snapshot fetch failed", {
      endpoint: "DELETE /api/v1/inspections/:inspectionId/answers/:questionId",
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

  // ── 3. Extract visible question set and current answers ─────────────────
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;

  const visibleQuestionIdsRaw = snapshot["visible_question_ids"];
  const visibleQuestionIds: string[] = Array.isArray(visibleQuestionIdsRaw)
    ? visibleQuestionIdsRaw.filter((v): v is string => typeof v === "string")
    : [];

  const answersRaw = snapshot["answers"];
  const currentAnswers: Record<string, string> =
    typeof answersRaw === "object" &&
    answersRaw !== null &&
    !Array.isArray(answersRaw)
      ? (answersRaw as Record<string, string>)
      : {};

  // ── 4. Visibility and existence guard ──────────────────────────────────
  // Reject if the question is not visible OR if no answer exists for it.
  // Both cases are 404 to avoid leaking details about the question set state.
  if (
    !visibleQuestionIds.includes(questionId) ||
    !(questionId in currentAnswers)
  ) {
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message:
        "The answer was not found or the question is not part of the current visible question set.",
    });
  }

  // ── 5. Persist via SQL RPC ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "delete_inspection_answer",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_question_id: questionId,
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

    console.error("[delete-inspection-answer] rpc call failed", {
      endpoint: "DELETE /api/v1/inspections/:inspectionId/answers/:questionId",
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

  const rows = rpcData as DeleteAnswerRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[delete-inspection-answer] rpc returned no rows", {
      endpoint: "DELETE /api/v1/inspections/:inspectionId/answers/:questionId",
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

  // ── 6. Compute derived metrics from the reduced answer map ──────────────
  const nextAnswers = { ...currentAnswers };
  delete nextAnswers[questionId];

  const progress = computeProgress(nextAnswers, visibleQuestionIds);
  const scoreDistribution = computeScoreDistribution(
    nextAnswers,
    visibleQuestionIds,
  );

  return {
    inspectionId,
    questionId,
    deleted: true,
    snapshotVersion: rows[0]!.snapshot_version,
    progress,
    scoreDistribution,
  };
}
