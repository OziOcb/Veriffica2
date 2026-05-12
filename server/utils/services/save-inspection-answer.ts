import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import {
  computeProgress,
  computeScoreDistribution,
} from "./inspection-snapshot";
import type {
  PutInspectionAnswerCommand,
  PutInspectionAnswerResult,
} from "../../../shared/contracts/inspections";

// ── Internal types ──────────────────────────────────────────────────────────

interface FetchedInspection {
  status: string;
  snapshot_version: number;
  snapshot: Record<string, unknown>;
}

interface SaveAnswerRpcRow {
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
 * Saves or replaces a single answer for the given question in the inspection
 * snapshot.
 *
 * Guards:
 * - `404` when the inspection does not exist or belongs to a different user.
 * - `409` when status is `completed` or `baseSnapshotVersion` is stale.
 * - `422` when `questionId` is not in the current visible question set.
 *
 * No-op: when the stored answer is already identical, returns the current
 * `snapshotVersion` without calling the SQL RPC or bumping `updated_at`.
 *
 * NOTE: RLS is disabled on public.inspections; the service-role client plus
 * explicit `user_id` filter enforce ownership.
 */
export async function saveInspectionAnswer(
  event: H3Event,
  userId: string,
  inspectionId: string,
  questionId: string,
  command: PutInspectionAnswerCommand,
  requestId: string,
): Promise<PutInspectionAnswerResult> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current inspection row ────────────────────────────────────
  const { data: existing, error: fetchError } = await client
    .from("inspections")
    .select("status, snapshot_version, snapshot")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[save-inspection-answer] snapshot fetch failed", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/answers/:questionId",
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

  // ── 4. Extract visible question set from snapshot ───────────────────────
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
  const visibleQuestionIdsRaw = snapshot["visible_question_ids"];
  const visibleQuestionIds: string[] = Array.isArray(visibleQuestionIdsRaw)
    ? visibleQuestionIdsRaw.filter((v): v is string => typeof v === "string")
    : [];

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

  // ── 6. Extract current answers ──────────────────────────────────────────
  const answersRaw = snapshot["answers"];
  const currentAnswers: Record<string, string> =
    typeof answersRaw === "object" &&
    answersRaw !== null &&
    !Array.isArray(answersRaw)
      ? (answersRaw as Record<string, string>)
      : {};

  // ── 7. No-op short-circuit ──────────────────────────────────────────────
  // If the stored answer is already identical, skip the write path entirely.
  if (currentAnswers[questionId] === command.answer) {
    const progress = computeProgress(currentAnswers, visibleQuestionIds);
    const scoreDistribution = computeScoreDistribution(
      currentAnswers,
      visibleQuestionIds,
    );
    return {
      inspectionId,
      questionId,
      answer: command.answer,
      snapshotVersion: row.snapshot_version,
      progress,
      scoreDistribution,
    };
  }

  // ── 8. Persist via SQL RPC ──────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "save_inspection_answer",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_question_id: questionId,
      p_answer: command.answer,
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

    console.error("[save-inspection-answer] rpc call failed", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/answers/:questionId",
      requestId,
      userId,
      inspectionId,
      questionId,
      baseSnapshotVersion: command.baseSnapshotVersion,
      errorMessage: rpcError.message,
      errorCode: (rpcError as { code?: string }).code,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const rows = rpcData as SaveAnswerRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[save-inspection-answer] rpc returned no rows", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/answers/:questionId",
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

  // ── 9. Compute derived metrics from the new answer map ──────────────────
  const nextAnswers = { ...currentAnswers, [questionId]: command.answer };
  const progress = computeProgress(nextAnswers, visibleQuestionIds);
  const scoreDistribution = computeScoreDistribution(
    nextAnswers,
    visibleQuestionIds,
  );

  return {
    inspectionId,
    questionId,
    answer: command.answer,
    snapshotVersion: rows[0]!.snapshot_version,
    progress,
    scoreDistribution,
  };
}
