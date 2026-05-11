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

import type { ExplanationRef, QuestionExplanationDto } from "~/types";

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
  /** Human-readable section name (e.g. "Car Body"). */
  section: string;
  /** Human-readable subsection name (e.g. "Corrosion, blistering"). */
  subsection: string;
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
  /** Human-readable question label as authored in the question bank. */
  label: string;
  /** Optional stable reference to a shared educational explanation. */
  explanationRef?: string;
}

interface QuestionBankExplanationEntry {
  legacyNumber: number;
  text: string;
}

// ── Raw data (inlined at build time via JSON import) ───────────────────────

import mappingConfigRaw from "../../.ai/veriffica-questions-list/question-mapping-config.json";
import questionBankRaw from "../../.ai/veriffica-questions-list/question-bank.json";

const mappingConfig = mappingConfigRaw as unknown as {
  questionGroups: QuestionGroup[];
};
const questionBankData = questionBankRaw as unknown as {
  questions: QuestionItem[];
  explanations: Record<string, QuestionBankExplanationEntry>;
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

/**
 * Map of questionId → human-readable label text.
 * Built once at module load time for O(1) lookup during response assembly.
 */
export const QUESTION_TEXT_BY_ID: ReadonlyMap<string, string> = new Map(
  QUESTIONS.map((q) => [q.id, q.label]),
);

/**
 * Map of groupId → canonical group title composed as "section — subsection".
 * Built once at module load time for O(1) lookup during response assembly.
 */
export const GROUP_TITLE_BY_ID: ReadonlyMap<string, string> = new Map(
  QUESTION_GROUPS.map((g) => [g.id, `${g.section} — ${g.subsection}`]),
);

/**
 * Normalizes the question-bank explanation refs (`exp-001`) into the API
 * shape used by the app DTOs (`exp_001`).
 */
export function normalizeExplanationRef(ref: string): ExplanationRef {
  return ref.replace(/^exp-/, "exp_") as ExplanationRef;
}

/**
 * Map of explanationRef -> normalized explanation DTO.
 * Built once at module load time so the resolved-questions service can reuse
 * canonical content without reading JSON at request time.
 */
export const QUESTION_EXPLANATIONS_BY_REF: ReadonlyMap<
  ExplanationRef,
  QuestionExplanationDto
> = new Map(
  Object.entries(questionBankData.explanations).map(([ref, explanation]) => [
    normalizeExplanationRef(ref),
    {
      title: `Explanation ${explanation.legacyNumber}`,
      content: explanation.text,
    },
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
