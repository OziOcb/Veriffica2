import { serverSupabaseServiceRole } from "#supabase/server";
import { createError } from "h3";
import type { H3Event } from "h3";
import type { Json, Tables } from "~/db/database.types";
import type {
  InspectionDetailDto,
  InspectionPart1Dto,
  InspectionRuntimeFlagsDto,
  InspectionAnswersDto,
  InspectionQuestionNotesDto,
  InspectionScoreDistributionDto,
  InspectionProgressDto,
  InspectionDetailedProgressDto,
  InspectionPartStateDto,
  InspectionAnswerValue,
  InspectionMode,
  InspectionStatus,
  FuelType,
  TransmissionType,
  DriveType,
  BodyType,
  QuestionId,
  QuestionGroupId,
} from "~/types";
import type { GetInspectionDetailQuery } from "../../../shared/contracts/inspections";

/**
 * Columns selected from public.inspections for the detail view.
 * Includes relational Part 1 projection columns alongside snapshot JSONB.
 */
type InspectionDetailRow = Pick<
  Tables<"inspections">,
  | "id"
  | "title"
  | "status"
  | "question_bank_version"
  | "snapshot_schema_version"
  | "snapshot_version"
  | "client_updated_at"
  | "created_at"
  | "updated_at"
  | "completed_at"
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

export interface GetInspectionDetailResult {
  inspection: InspectionDetailDto;
}

// ── Snapshot extraction ────────────────────────────────────────────────────

interface SnapshotDetailFields {
  runtimeFlags: Record<string, unknown>;
  answers: Record<string, string>;
  questionNotes: Record<string, string>;
  globalNotes: string;
  visibleGroupIds: string[];
  visibleQuestionIds: string[];
}

/**
 * Extracts detail-relevant fields from the raw JSONB snapshot.
 * Returns safe empty defaults for any malformed or missing sub-fields.
 */
function extractSnapshotDetailFields(raw: Json): SnapshotDetailFields {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      runtimeFlags: {},
      answers: {},
      questionNotes: {},
      globalNotes: "",
      visibleGroupIds: [],
      visibleQuestionIds: [],
    };
  }

  const snap = raw as Record<string, Json | undefined>;

  const runtimeFlagsRaw = snap["runtime_flags"];
  const runtimeFlags: Record<string, unknown> =
    typeof runtimeFlagsRaw === "object" &&
    runtimeFlagsRaw !== null &&
    !Array.isArray(runtimeFlagsRaw)
      ? (runtimeFlagsRaw as Record<string, unknown>)
      : {};

  const answersRaw = snap["answers"];
  const answers: Record<string, string> =
    typeof answersRaw === "object" &&
    answersRaw !== null &&
    !Array.isArray(answersRaw)
      ? (answersRaw as Record<string, string>)
      : {};

  const questionNotesRaw = snap["question_notes"];
  const questionNotes: Record<string, string> =
    typeof questionNotesRaw === "object" &&
    questionNotesRaw !== null &&
    !Array.isArray(questionNotesRaw)
      ? (questionNotesRaw as Record<string, string>)
      : {};

  const globalNotes =
    typeof snap["global_notes"] === "string" ? snap["global_notes"] : "";

  const visibleGroupIdsRaw = snap["visible_group_ids"];
  const visibleGroupIds: string[] = Array.isArray(visibleGroupIdsRaw)
    ? visibleGroupIdsRaw.filter((v): v is string => typeof v === "string")
    : [];

  const visibleQuestionIdsRaw = snap["visible_question_ids"];
  const visibleQuestionIds: string[] = Array.isArray(visibleQuestionIdsRaw)
    ? visibleQuestionIdsRaw.filter((v): v is string => typeof v === "string")
    : [];

  return {
    runtimeFlags,
    answers,
    questionNotes,
    globalNotes,
    visibleGroupIds,
    visibleQuestionIds,
  };
}

// ── Derived field computation ──────────────────────────────────────────────

function buildRuntimeFlags(
  raw: Record<string, unknown>,
): InspectionRuntimeFlagsDto {
  return {
    chargingPortEquipped: raw["chargingPortEquipped"] === true,
    evBatteryDocsAvailable: raw["evBatteryDocsAvailable"] === true,
    turboEquipped: raw["turboEquipped"] === true,
    mechanicalCompressorEquipped: raw["mechanicalCompressorEquipped"] === true,
    importedFromEU: raw["importedFromEU"] === true,
  };
}

/**
 * Builds InspectionPart1Dto from the relational columns.
 * Returns null when any required identifying field (make, model, fuel_type,
 * transmission, drive, body_type) is absent.
 * The `notes` field is read from snapshot.part_1.notes.
 */
function buildPart1(
  row: InspectionDetailRow,
  raw: Json,
): InspectionPart1Dto | null {
  if (
    !row.make ||
    !row.model ||
    !row.fuel_type ||
    !row.transmission ||
    !row.drive ||
    !row.body_type
  ) {
    return null;
  }

  const snap =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, Json | undefined>)
      : null;
  const part1Raw = snap?.["part_1"];
  const part1Snap =
    typeof part1Raw === "object" &&
    part1Raw !== null &&
    !Array.isArray(part1Raw)
      ? (part1Raw as Record<string, unknown>)
      : null;
  const notes =
    typeof part1Snap?.["notes"] === "string" ? part1Snap["notes"] : "";

  return {
    price: row.price,
    make: row.make,
    model: row.model,
    yearOfProduction: row.year_of_production,
    registrationNumber: row.registration_number,
    vinNumber: row.vin_number,
    mileage: row.mileage,
    fuelType: row.fuel_type as FuelType,
    transmission: row.transmission as TransmissionType,
    drive: row.drive as DriveType,
    color: row.color,
    bodyType: row.body_type as BodyType,
    numberOfDoors: row.number_of_doors,
    address: row.address,
    notes,
  };
}

function computeProgress(
  answers: Record<string, string>,
  visibleQuestionIds: string[],
): InspectionProgressDto {
  const visibleQuestions = visibleQuestionIds.length;
  const answeredQuestions = visibleQuestionIds.filter(
    (id) => id in answers,
  ).length;
  const completionRate =
    visibleQuestions > 0
      ? Math.round((answeredQuestions / visibleQuestions) * 10000) / 100
      : 0;
  return { answeredQuestions, visibleQuestions, completionRate };
}

function computeScoreDistribution(
  answers: Record<string, string>,
  visibleQuestionIds: string[],
): InspectionScoreDistributionDto {
  let yes = 0;
  let no = 0;
  let dontKnow = 0;

  for (const qId of visibleQuestionIds) {
    const answer = answers[qId] as InspectionAnswerValue | undefined;
    if (answer === "yes") yes++;
    else if (answer === "no") no++;
    else if (answer === "dont_know") dontKnow++;
  }

  return { yes, no, dontKnow };
}

/**
 * Builds the parts state array for all five parts.
 *
 * Parts 2–5 are enabled only when Part 1 is completed. Per-part `completed`
 * state for parts 2–5 requires question bank metadata to determine which
 * visible_question_ids belong to each part. Until the question bank module is
 * integrated, completion for parts 2–5 defaults to false.
 */
function computeParts(part1Completed: boolean): InspectionPartStateDto[] {
  return [
    { part: "part1", enabled: true, completed: part1Completed },
    { part: "part2", enabled: part1Completed, completed: false },
    { part: "part3", enabled: part1Completed, completed: false },
    { part: "part4", enabled: part1Completed, completed: false },
    { part: "part5", enabled: part1Completed, completed: false },
  ];
}

/**
 * Builds the detailed progress object including per-part breakdown.
 *
 * NOTE: Per-part progress requires question bank metadata to map
 * visible_question_ids to their respective parts. Until that module is
 * integrated, `progress.parts` is returned as an empty array.
 */
function computeDetailedProgress(
  answers: Record<string, string>,
  visibleQuestionIds: string[],
): InspectionDetailedProgressDto {
  const global = computeProgress(answers, visibleQuestionIds);
  return { ...global, parts: [] };
}

// ── Row mapping ────────────────────────────────────────────────────────────

function mapRowToInspectionDetail(
  row: InspectionDetailRow,
): InspectionDetailDto {
  const {
    runtimeFlags: runtimeFlagsRaw,
    answers,
    questionNotes,
    globalNotes,
    visibleGroupIds,
    visibleQuestionIds,
  } = extractSnapshotDetailFields(row.snapshot);

  const runtimeFlags = buildRuntimeFlags(runtimeFlagsRaw);
  const part1 = buildPart1(row, row.snapshot);
  const part1Completed = part1 !== null;
  const scoreDistribution = computeScoreDistribution(
    answers,
    visibleQuestionIds,
  );
  const progress = computeDetailedProgress(answers, visibleQuestionIds);
  const parts = computeParts(part1Completed);
  const mode: InspectionMode = row.status === "draft" ? "editable" : "report";

  return {
    id: row.id,
    title: row.title,
    status: row.status as InspectionStatus,
    questionBankVersion: row.question_bank_version,
    snapshotSchemaVersion: row.snapshot_schema_version,
    snapshotVersion: row.snapshot_version,
    clientUpdatedAt: row.client_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    part1,
    runtimeFlags,
    answers: answers as InspectionAnswersDto,
    questionNotes: questionNotes as InspectionQuestionNotesDto,
    globalNotes,
    visibleGroupIds: visibleGroupIds as QuestionGroupId[],
    visibleQuestionIds: visibleQuestionIds as QuestionId[],
    parts,
    progress,
    scoreDistribution,
    mode,
  };
}

// ── Main service ───────────────────────────────────────────────────────────

/**
 * Fetches a single inspection by ID, verifying that it belongs to the
 * authenticated user.
 *
 * NOTE: RLS is disabled on public.inspections (see migration
 * 20260501000100_disable_app_table_rls.sql), so the service-role client is
 * used and every query MUST include an explicit `.eq('user_id', userId)` filter
 * to prevent data leakage across users.
 *
 * @param _query - Validated query params. Reserved for future `include`
 *   expansion support (e.g. summary, questions-meta). Currently unused.
 * @throws 404 Not Found when the inspection does not exist or belongs to
 *   another user. Identical response for both cases to prevent resource
 *   existence leakage.
 * @throws 500 Internal Server Error for unexpected database failures.
 */
export async function getInspectionDetail(
  event: H3Event,
  userId: string,
  inspectionId: string,
  _query: GetInspectionDetailQuery,
  requestId: string,
): Promise<GetInspectionDetailResult> {
  const client = serverSupabaseServiceRole(event);

  const { data, error } = await client
    .from("inspections")
    .select(
      "id, title, status, question_bank_version, snapshot_schema_version, snapshot_version, client_updated_at, created_at, updated_at, completed_at, snapshot, make, model, year_of_production, registration_number, vin_number, mileage, fuel_type, transmission, drive, color, body_type, number_of_doors, address, price",
    )
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[get-inspection-detail] DB query failed", {
      endpoint: "GET /api/v1/inspections/:inspectionId",
      requestId,
      userId,
      inspectionId,
      errorMessage: error.message,
      errorCode: error.code,
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

  return { inspection: mapRowToInspectionDetail(data) };
}
