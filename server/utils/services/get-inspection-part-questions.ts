import { serverSupabaseServiceRole } from "#supabase/server";
import { createError } from "h3";
import type { H3Event } from "h3";
import type { Tables } from "~/db/database.types";
import type {
  ResolvedQuestionGroupDto,
  ResolvedQuestionDto,
  QuestionExplanationDictionaryDto,
  GetInspectionPartQuestionsResultDto,
  ExplanationRef,
  InspectionAnswerValue,
  QuestionId,
  InspectionQuestionPartId,
} from "~/types";
import {
  QUESTION_GROUPS,
  QUESTIONS,
  QUESTION_TEXT_BY_ID,
  GROUP_TITLE_BY_ID,
  QUESTION_EXPLANATIONS_BY_REF,
  normalizeExplanationRef,
} from "../question-bank";
import {
  extractSnapshotFields,
  buildPart1,
  type SnapshotSourceRow,
} from "./inspection-snapshot";

// ── Row type ───────────────────────────────────────────────────────────────

/**
 * Minimal columns selected from `public.inspections` for this endpoint.
 * Only snapshot-related and ownership fields are needed — no title, no status,
 * no completed_at, etc.
 */
type InspectionSnapshotRow = Pick<
  Tables<"inspections">,
  | "user_id"
  | "question_bank_version"
  | "snapshot"
  | "make"
  | "model"
  | "year_of_production"
  | "registration_number"
  | "vin_number"
  | "mileage"
  | "fuel_type"
  | "transmission"
  | "drive"
  | "color"
  | "body_type"
  | "number_of_doors"
  | "address"
  | "price"
>;

const SNAPSHOT_SELECT =
  "user_id, question_bank_version, snapshot, make, model, year_of_production, registration_number, vin_number, mileage, fuel_type, transmission, drive, color, body_type, number_of_doors, address, price";

// ── Service result type ────────────────────────────────────────────────────

export interface GetInspectionPartQuestionsResult {
  data: GetInspectionPartQuestionsResultDto;
}

// ── Expansion flags ────────────────────────────────────────────────────────

export interface QuestionExpansionSet {
  includeAnswers: boolean;
  includeNotes: boolean;
  includeExplanations: boolean;
}

// ── Response assembly ──────────────────────────────────────────────────────

/**
 * Builds the ordered array of resolved question group cards for the given
 * `partId`, filtered down to `visibleGroupIds` from the snapshot.
 * Each group card lists only the question IDs that are also in
 * `visibleQuestionIds`.
 */
function buildGroups(
  partId: InspectionQuestionPartId,
  visibleGroupIds: Set<string>,
  visibleQuestionIds: Set<string>,
): ResolvedQuestionGroupDto[] {
  return QUESTION_GROUPS.filter(
    (g) => g.part === partId && visibleGroupIds.has(g.id),
  ).map((g) => {
    const allQuestionsInGroup = QUESTIONS.filter(
      (q) => q.groupId === g.id && q.part === partId,
    );
    const visibleInGroup = allQuestionsInGroup
      .filter((q) => visibleQuestionIds.has(q.id))
      .map((q) => q.id as QuestionId);

    return {
      id: g.id,
      order: g.order,
      title: GROUP_TITLE_BY_ID.get(g.id) ?? `${g.section} — ${g.subsection}`,
      questionIds: visibleInGroup,
    };
  });
}

/**
 * Builds the flat ordered array of resolved question cards for the given
 * `partId`, filtered to `visibleQuestionIds`, with optional expansions.
 */
function buildQuestions(
  partId: InspectionQuestionPartId,
  visibleQuestionIds: Set<string>,
  answers: Record<string, string>,
  questionNotes: Record<string, string>,
  expansion: QuestionExpansionSet,
): ResolvedQuestionDto[] {
  return QUESTIONS.filter(
    (q) => q.part === partId && visibleQuestionIds.has(q.id),
  ).map((q) => {
    const card: ResolvedQuestionDto = {
      id: q.id as ResolvedQuestionDto["id"],
      groupId: q.groupId,
      order: q.order,
      text: QUESTION_TEXT_BY_ID.get(q.id) ?? q.label,
      allowedAnswers: ["yes", "no", "dont_know"] as InspectionAnswerValue[],
    };

    if (q.explanationRef) {
      card.explanationRef = normalizeExplanationRef(q.explanationRef);
    }

    if (expansion.includeAnswers) {
      const raw = answers[q.id];
      if (raw === "yes" || raw === "no" || raw === "dont_know") {
        card.answer = raw;
      }
    }

    if (expansion.includeNotes) {
      const note = questionNotes[q.id];
      if (typeof note === "string" && note.length > 0) {
        card.questionNote = note;
      }
    }

    return card;
  });
}

/**
 * Builds the explanation dictionary keyed by `explanationRef`, containing
 * only entries referenced by at least one visible question.
 *
 * NOTE: The current `question-bank.json` does not include `explanationRef`
 * fields per question. This function returns an empty dictionary until the
 * question bank artifact is extended with explanation references. The
 * contract supports explanations; the data source does not yet populate them.
 */
function buildExplanations(
  visibleQuestions: ResolvedQuestionDto[],
): QuestionExplanationDictionaryDto {
  const explanations: QuestionExplanationDictionaryDto = {};

  for (const question of visibleQuestions) {
    const explanationRef = question.explanationRef;
    if (!explanationRef || explanations[explanationRef]) {
      continue;
    }

    const explanation = QUESTION_EXPLANATIONS_BY_REF.get(explanationRef);
    if (!explanation) {
      continue;
    }

    explanations[explanationRef] = explanation;
  }

  return explanations;
}

// ── Main service ───────────────────────────────────────────────────────────

/**
 * Fetches resolved question cards for a specific part of an inspection.
 *
 * Responsibilities:
 * - Fetches the inspection row (minimal columns) with explicit `id + user_id`
 *   filter — RLS is disabled so the ownership check is mandatory.
 * - Validates that Part 1 is present; rejects with 422 if it is not, because
 *   visibility cannot be computed without Part 1 data.
 * - Filters `QUESTION_GROUPS` and `QUESTIONS` to the requested `partId` and
 *   the snapshot-persisted `visibleGroupIds` / `visibleQuestionIds`.
 * - Conditionally attaches `answer`, `questionNote`, and `explanations`
 *   based on the `expansion` flags requested by the client.
 *
 * @throws 404 when the inspection does not exist or belongs to another user.
 * @throws 422 when Part 1 is not yet completed on the inspection.
 * @throws 500 on unexpected DB or mapping errors.
 */
export async function getInspectionPartQuestions(
  event: H3Event,
  userId: string,
  inspectionId: string,
  partId: InspectionQuestionPartId,
  expansion: QuestionExpansionSet,
  requestId: string,
): Promise<GetInspectionPartQuestionsResult> {
  const client = serverSupabaseServiceRole(event);

  // ── DB fetch ─────────────────────────────────────────────────────────────

  const { data, error } = await client
    .from("inspections")
    .select(SNAPSHOT_SELECT)
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle<InspectionSnapshotRow>();

  if (error) {
    console.error("[get-inspection-part-questions] DB query failed", {
      endpoint: `GET /api/v1/inspections/:inspectionId/parts/:partId/questions`,
      requestId,
      userId,
      inspectionId,
      partId,
      errorCode: error.code,
      errorMessage: error.message,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while fetching the inspection.",
    });
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Not Found",
      message: "The requested inspection was not found.",
    });
  }

  // ── Part 1 guard ──────────────────────────────────────────────────────────

  const snapshotRow = data as SnapshotSourceRow;
  const part1 = buildPart1(snapshotRow);

  if (!part1) {
    console.warn("[get-inspection-part-questions] Part 1 not ready", {
      requestId,
      userId,
      inspectionId,
      partId,
    });

    throw createError({
      statusCode: 422,
      statusMessage: "Unprocessable Entity",
      message:
        "Part 1 must be completed before questions can be resolved for this inspection.",
    });
  }

  // ── Snapshot extraction ───────────────────────────────────────────────────

  const { answers, questionNotes, visibleGroupIds, visibleQuestionIds } =
    extractSnapshotFields(data.snapshot);

  const visibleGroupSet = new Set(visibleGroupIds);
  const visibleQuestionSet = new Set(visibleQuestionIds);

  // ── Response assembly ─────────────────────────────────────────────────────

  const groups = buildGroups(partId, visibleGroupSet, visibleQuestionSet);
  const questions = buildQuestions(
    partId,
    visibleQuestionSet,
    answers,
    questionNotes,
    expansion,
  );

  const resultData: GetInspectionPartQuestionsResultDto = {
    inspectionId,
    part: partId,
    questionBankVersion: data.question_bank_version,
    groups,
    questions,
  };

  if (expansion.includeExplanations) {
    resultData.explanations = buildExplanations(questions);
  }

  return { data: resultData };
}
