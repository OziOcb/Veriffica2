/**
 * Shared helpers for extracting the canonical inspection snapshot from the
 * raw JSONB column returned by Supabase.
 *
 * These functions are pure and side-effect-free — they only transform the
 * in-memory representation of a DB row. They are used by both
 * `get-inspection-detail.ts` and `get-inspection-part-questions.ts` (and any
 * future service that needs to decode snapshot state).
 *
 * No DB queries, no H3 event, no Nitro imports here.
 */

import type { Json, Tables } from "~/db/database.types";
import type {
  InspectionPart1Dto,
  InspectionRuntimeFlagsDto,
  FuelType,
  TransmissionType,
  DriveType,
  BodyType,
  InspectionAnswersDto,
  InspectionQuestionNotesDto,
  QuestionId,
  QuestionGroupId,
} from "~/types";

// ── Row type ───────────────────────────────────────────────────────────────

/**
 * Minimal columns required to reconstruct Part 1 from a DB row.
 * Services select only the columns they need; this type describes the subset
 * that snapshot-parsing helpers depend on.
 */
export type SnapshotSourceRow = Pick<
  Tables<"inspections">,
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

// ── Extracted snapshot shape ───────────────────────────────────────────────

export interface SnapshotFields {
  runtimeFlags: Record<string, unknown>;
  answers: Record<string, string>;
  questionNotes: Record<string, string>;
  globalNotes: string;
  visibleGroupIds: string[];
  visibleQuestionIds: string[];
}

// ── Parsers ────────────────────────────────────────────────────────────────

/**
 * Extracts all snapshot-resident fields from the raw JSONB value.
 * Returns safe empty defaults for any malformed or missing sub-fields.
 *
 * This is the single canonical extraction path — do not duplicate this logic
 * in individual service files.
 */
export function extractSnapshotFields(raw: Json): SnapshotFields {
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

/**
 * Builds a typed `InspectionRuntimeFlagsDto` from the raw runtime_flags
 * sub-object in the snapshot. Unknown keys are ignored; missing keys default
 * to `false`.
 */
export function buildRuntimeFlags(
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
 * Reconstructs `InspectionPart1Dto` from the relational projection columns
 * stored on the inspection row.
 *
 * Returns `null` when any required identifying field (`make`, `model`,
 * `fuel_type`, `transmission`, `drive`, `body_type`) is absent — these
 * columns are populated only after a successful PUT Part 1.
 *
 * The `notes` field is read from `snapshot.part_1.notes` rather than from a
 * relational column, because it is stored exclusively in the JSONB snapshot.
 */
export function buildPart1(row: SnapshotSourceRow): InspectionPart1Dto | null {
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
    typeof row.snapshot === "object" &&
    row.snapshot !== null &&
    !Array.isArray(row.snapshot)
      ? (row.snapshot as Record<string, Json | undefined>)
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

/**
 * Convenience type-cast helper that converts the raw string maps coming out
 * of the snapshot to the strongly-typed DTO aliases used in service responses.
 */
export function castSnapshotFields(fields: SnapshotFields): {
  answers: InspectionAnswersDto;
  questionNotes: InspectionQuestionNotesDto;
  visibleGroupIds: QuestionGroupId[];
  visibleQuestionIds: QuestionId[];
} {
  return {
    answers: fields.answers as InspectionAnswersDto,
    questionNotes: fields.questionNotes as InspectionQuestionNotesDto,
    visibleGroupIds: fields.visibleGroupIds as QuestionGroupId[],
    visibleQuestionIds: fields.visibleQuestionIds as QuestionId[],
  };
}
