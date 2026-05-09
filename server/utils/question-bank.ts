/**
 * Canonical question bank singleton for server-side visibility resolution.
 *
 * Data is sourced from the `.ai/` planning artifacts and bundled at build
 * time. Neither file is read from disk at runtime — Rollup (Nitro) inlines
 * JSON imports as module-level constants.
 *
 * Update procedure: when the question bank JSON files change, no code change
 * is required here — the JSON import automatically picks up the new content
 * on the next build.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** Lowercase value as stored in the question-mapping-config JSON. */
type FuelTypeKey = "petrol" | "diesel" | "hybrid" | "electric";
type TransmissionKey = "manual" | "automatic";
type DriveKey = "2wd" | "4wd";
type BodyTypeKey =
  | "sedan"
  | "hatchback"
  | "suv"
  | "coupe"
  | "convertible"
  | "van"
  | "pickup"
  | "other";

type RuntimeFlagKey =
  | "chargingPortEquipped"
  | "evBatteryDocsAvailable"
  | "turboEquipped"
  | "mechanicalCompressorEquipped"
  | "importedFromEU";

/**
 * Visibility conditions for a question group.
 * A group is visible when ALL listed conditions match Part 1 field values.
 * An empty `visibleWhen` object means the group is always visible (base group).
 */
interface VisibleWhen {
  fuelType?: FuelTypeKey[];
  transmission?: TransmissionKey[];
  drive?: DriveKey[];
  bodyType?: BodyTypeKey[];
}

export interface QuestionGroup {
  id: string;
  part: "part2" | "part3" | "part4" | "part5";
  order: number;
  /** Fields from Part 1 that gate this group's visibility. */
  dependsOnFields: string[];
  /**
   * Conditions that must all be satisfied for the group to be visible.
   * Empty means always visible (base group).
   */
  visibleWhen: VisibleWhen;
  /**
   * When set, the group is only visible if this runtime flag is `true`.
   * This constraint is in addition to `visibleWhen`.
   */
  requiresEquipmentFlag?: RuntimeFlagKey;
}

export interface QuestionItem {
  id: string;
  groupId: string;
  part: "part2" | "part3" | "part4" | "part5";
  order: number;
}

// ── Raw data (inlined at build time via JSON import) ───────────────────────

import mappingConfigRaw from "../../.ai/veriffica-questions-list/question-mapping-config.json";
import questionBankRaw from "../../.ai/veriffica-questions-list/question-bank.json";

const mappingConfig = mappingConfigRaw as unknown as {
  questionGroups: QuestionGroup[];
};
const questionBankData = questionBankRaw as unknown as {
  questions: QuestionItem[];
};

// ── Exported singletons ────────────────────────────────────────────────────

/** All question groups with their visibility rules, ordered by `order` asc. */
export const QUESTION_GROUPS: readonly QuestionGroup[] =
  mappingConfig.questionGroups;

/** All questions, ordered by `order` asc. */
export const QUESTIONS: readonly QuestionItem[] = questionBankData.questions;

/**
 * Map of groupId → question IDs belonging to that group, preserving order.
 * Built once at module load time for O(1) lookup during visibility resolution.
 */
export const QUESTIONS_BY_GROUP: ReadonlyMap<string, readonly string[]> =
  new Map(
    QUESTION_GROUPS.map((g) => [
      g.id,
      QUESTIONS.filter((q) => q.groupId === g.id).map((q) => q.id),
    ]),
  );

// ── Part 1 field → question bank key mappers ───────────────────────────────

/**
 * Maps Part 1 API enum values (PascalCase/uppercase) to the lowercase keys
 * used in `question-mapping-config.json`.
 */
export function toFuelTypeKey(fuelType: string): FuelTypeKey {
  return fuelType.toLowerCase() as FuelTypeKey;
}

export function toTransmissionKey(transmission: string): TransmissionKey {
  return transmission.toLowerCase() as TransmissionKey;
}

export function toDriveKey(drive: string): DriveKey {
  return drive.toLowerCase() as DriveKey;
}

export function toBodyTypeKey(bodyType: string): BodyTypeKey {
  return bodyType.toLowerCase() as BodyTypeKey;
}
