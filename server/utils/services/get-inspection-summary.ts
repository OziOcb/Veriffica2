import type { H3Event } from "h3";
import {
  computeProgress,
  computeScoreDistribution,
  extractSnapshotFields,
} from "./inspection-snapshot";
import { loadOwnedInspection } from "./load-owned-inspection";
import { QUESTIONS, QUESTION_TEXT_BY_ID } from "../question-bank";
import type {
  InspectionSummaryDto,
  InspectionSummaryPartDto,
  InspectionSummaryQuestionDto,
  InspectionMode,
  InspectionAnswerValue,
  InspectionQuestionPartId,
  QuestionId,
} from "~/types";
import type { GetInspectionSummaryQuery } from "../../../shared/contracts/inspections";

// ── Build-time singletons ──────────────────────────────────────────────────

const QUESTION_PART_IDS: readonly InspectionQuestionPartId[] = [
  "part2",
  "part3",
  "part4",
  "part5",
];

/**
 * Map of questionId → { part, groupId } built once at module load.
 * Avoids repeated O(n) scans of the QUESTIONS array per request.
 */
const _QUESTION_META_BY_ID: ReadonlyMap<
  string,
  { part: InspectionQuestionPartId; groupId: string }
> = new Map(QUESTIONS.map((q) => [q.id, { part: q.part, groupId: q.groupId }]));

// ── Service ────────────────────────────────────────────────────────────────

export interface GetInspectionSummaryResult {
  summary: InspectionSummaryDto;
}

/**
 * Builds the `InspectionSummaryDto` for a single inspection.
 *
 * Always returns: `inspectionId`, `title`, `status`, `mode`,
 * `totalScoreDistribution`, `parts[]`, and `progress`.
 *
 * When `include=questions` is requested the response also includes a
 * `questions[]` array of **answered** visible questions, preserving snapshot
 * order. When `include=questions,notes` is also requested, each question row
 * carries its `questionNote` when one is recorded in the snapshot.
 *
 * No additional DB queries — all data comes from the snapshot JSONB column
 * and the build-time question bank singletons.
 *
 * NOTE: RLS is disabled on public.inspections; ownership is enforced by the
 * `loadOwnedInspection` helper via an explicit `user_id` filter.
 *
 * @throws 404 Not Found when the inspection does not exist or belongs to
 *   another user.
 * @throws 500 Internal Server Error for unexpected database or mapping errors.
 */
export async function getInspectionSummary(
  event: H3Event,
  userId: string,
  inspectionId: string,
  query: GetInspectionSummaryQuery,
  requestId: string,
): Promise<GetInspectionSummaryResult> {
  const row = await loadOwnedInspection(
    event,
    userId,
    inspectionId,
    "GET /api/v1/inspections/:inspectionId/summary",
    requestId,
  );

  const { answers, questionNotes, visibleQuestionIds } = extractSnapshotFields(
    row.snapshot,
  );

  const includeQuestions = query.include.includes("questions");
  const includeNotes = query.include.includes("notes");

  // ── Per-part score distributions ──────────────────────────────────────

  // Group visible question IDs by part in a single pass.
  const questionIdsByPart = new Map<InspectionQuestionPartId, string[]>();
  for (const partId of QUESTION_PART_IDS) {
    questionIdsByPart.set(partId, []);
  }
  for (const qId of visibleQuestionIds) {
    const meta = _QUESTION_META_BY_ID.get(qId);
    if (meta) {
      questionIdsByPart.get(meta.part)?.push(qId);
    }
  }

  const parts: InspectionSummaryPartDto[] = QUESTION_PART_IDS.map((part) => ({
    part,
    scoreDistribution: computeScoreDistribution(
      answers,
      questionIdsByPart.get(part) ?? [],
    ),
  }));

  const totalScoreDistribution = computeScoreDistribution(
    answers,
    visibleQuestionIds,
  );
  const progress = computeProgress(answers, visibleQuestionIds);
  const mode: InspectionMode = row.status === "draft" ? "editable" : "report";

  // ── Optional questions expansion ───────────────────────────────────────

  let questions: InspectionSummaryQuestionDto[] | undefined;
  if (includeQuestions) {
    // Only include questions that have a recorded answer so that the required
    // `answer` field on `InspectionSummaryQuestionDto` is always valid.
    questions = visibleQuestionIds.reduce<InspectionSummaryQuestionDto[]>(
      (acc, qId) => {
        const answer = answers[qId] as InspectionAnswerValue | undefined;
        if (!answer) return acc;

        const meta = _QUESTION_META_BY_ID.get(qId);
        const text = QUESTION_TEXT_BY_ID.get(qId) ?? "";
        const part = meta?.part ?? "part2";
        const groupId = meta?.groupId ?? "";

        const dto: InspectionSummaryQuestionDto = {
          questionId: qId as QuestionId,
          part,
          groupId,
          text,
          answer,
          editable: row.status === "draft",
        };

        if (includeNotes) {
          const note = questionNotes[qId];
          if (note !== undefined) {
            dto.questionNote = note;
          }
        }

        acc.push(dto);
        return acc;
      },
      [],
    );
  }

  const summary: InspectionSummaryDto = {
    inspectionId: row.id,
    title: row.title,
    status: row.status as "draft" | "completed",
    mode,
    totalScoreDistribution,
    parts,
    progress,
    ...(questions !== undefined ? { questions } : {}),
  };

  return { summary };
}
