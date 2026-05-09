import type { InspectionRuntimeFlagsDto } from "~/types";
import type {
  PutInspectionPart1Command,
  SmartPruningResult,
} from "../../../shared/contracts/inspections";
import {
  QUESTION_GROUPS,
  QUESTIONS_BY_GROUP,
  toFuelTypeKey,
  toTransmissionKey,
  toDriveKey,
  toBodyTypeKey,
} from "../question-bank";

/**
 * Resolves which question groups and individual questions are visible given
 * the current Part 1 values and runtime equipment flags.
 *
 * Algorithm (additive-buckets visibility model):
 * 1. For each group in the bank, evaluate its `visibleWhen` conditions:
 *    - An empty `visibleWhen` means the group is a "base" group — always visible.
 *    - Each key in `visibleWhen` is a Part 1 field name; the group is visible
 *      only if the current field value is listed in that key's array.
 *    - All listed conditions must be satisfied (AND logic).
 * 2. If the group has `requiresEquipmentFlag`, the corresponding runtime flag
 *    must also be `true` (AND on top of the `visibleWhen` result).
 * 3. `visibleQuestionIds` = union of question IDs from all visible groups.
 *
 * Field value mapping: Part 1 uses title-case / uppercase enum values
 * (`"Petrol"`, `"2WD"`), while the question bank stores lowercase
 * (`"petrol"`, `"2wd"`). The `toXxxKey` helpers perform this conversion.
 */
export function resolveVisibility(
  part1: PutInspectionPart1Command,
  runtimeFlags: InspectionRuntimeFlagsDto,
): { visibleGroupIds: string[]; visibleQuestionIds: string[] } {
  const fuelTypeKey = toFuelTypeKey(part1.fuelType);
  const transmissionKey = toTransmissionKey(part1.transmission);
  const driveKey = toDriveKey(part1.drive);
  const bodyTypeKey = toBodyTypeKey(part1.bodyType);

  const visibleGroupIds: string[] = [];
  const visibleQuestionIds: string[] = [];

  for (const group of QUESTION_GROUPS) {
    // ── Evaluate visibleWhen conditions ──────────────────────────────────
    const { visibleWhen } = group;

    if (visibleWhen.fuelType && !visibleWhen.fuelType.includes(fuelTypeKey)) {
      continue;
    }

    if (
      visibleWhen.transmission &&
      !visibleWhen.transmission.includes(transmissionKey)
    ) {
      continue;
    }

    if (visibleWhen.drive && !visibleWhen.drive.includes(driveKey)) {
      continue;
    }

    if (visibleWhen.bodyType && !visibleWhen.bodyType.includes(bodyTypeKey)) {
      continue;
    }

    // ── Evaluate requiresEquipmentFlag ───────────────────────────────────
    if (
      group.requiresEquipmentFlag &&
      !runtimeFlags[group.requiresEquipmentFlag]
    ) {
      continue;
    }

    // Group passes all conditions — mark it and its questions visible.
    visibleGroupIds.push(group.id);

    const questionIds = QUESTIONS_BY_GROUP.get(group.id);
    if (questionIds) {
      for (const qId of questionIds) {
        visibleQuestionIds.push(qId);
      }
    }
  }

  return { visibleGroupIds, visibleQuestionIds };
}

/**
 * Removes answers and question notes that refer to questions which are no
 * longer visible after a Part 1 or runtime-flags update.
 *
 * This prevents stale data from questions that became invisible (e.g., because
 * a runtime flag was toggled off) from persisting in the snapshot, which would
 * corrupt progress calculations and summary reports.
 *
 * @param currentAnswers  Current snapshot answers map (`questionId → value`).
 * @param currentQuestionNotes  Current snapshot notes map (`questionId → text`).
 * @param newVisibleQuestionIds  The newly resolved visible question ID set.
 * @returns A `SmartPruningResult` describing what was (or was not) removed.
 *   The returned object does NOT mutate the input maps — callers receive the
 *   pruned maps through `removedAnswerIds` / `removedQuestionNoteIds`.
 */
export function applySmartPruning(
  currentAnswers: Record<string, string>,
  currentQuestionNotes: Record<string, string>,
  newVisibleQuestionIds: string[],
): SmartPruningResult {
  const visibleSet = new Set(newVisibleQuestionIds);

  const removedAnswerIds: string[] = [];
  const removedQuestionNoteIds: string[] = [];

  for (const questionId of Object.keys(currentAnswers)) {
    if (!visibleSet.has(questionId)) {
      removedAnswerIds.push(questionId);
    }
  }

  for (const questionId of Object.keys(currentQuestionNotes)) {
    if (!visibleSet.has(questionId)) {
      removedQuestionNoteIds.push(questionId);
    }
  }

  return {
    applied: removedAnswerIds.length > 0 || removedQuestionNoteIds.length > 0,
    removedAnswerIds,
    removedQuestionNoteIds,
  };
}
