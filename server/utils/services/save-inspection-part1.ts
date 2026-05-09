import type { H3Event } from "h3";
import { createError } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { InspectionRuntimeFlagsDto } from "~/types";
import type {
  PutInspectionPart1Command,
  PutInspectionPart1Result,
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

// ── Pure helper functions ──────────────────────────────────────────────────

/**
 * Builds the canonical inspection title from normalized Part 1 fields.
 *
 * Format: `"{make} {model}[ {yearOfProduction}][ {registrationNumber}]"`
 * Year and registration number are appended only when present (non-null).
 *
 * @example
 *   buildInspectionTitle({ make: "Toyota", model: "Corolla", yearOfProduction: 2018, registrationNumber: "WX12345", ... })
 *   // => "Toyota Corolla 2018 WX12345"
 *
 * @example
 *   buildInspectionTitle({ make: "Honda", model: "Civic", yearOfProduction: null, registrationNumber: null, ... })
 *   // => "Honda Civic"
 */
export function buildInspectionTitle(part1: PutInspectionPart1Command): string {
  const parts: string[] = [part1.make, part1.model];

  if (part1.yearOfProduction !== null) {
    parts.push(String(part1.yearOfProduction));
  }

  if (part1.registrationNumber !== null) {
    parts.push(part1.registrationNumber);
  }

  return parts.join(" ");
}

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
 * longer visible after a Part 1 update.
 *
 * This prevents stale data from questions that became invisible (e.g., because
 * the fuel type changed from Petrol to Electric) from persisting in the
 * snapshot, which would corrupt progress calculations and summary reports.
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

// ── Main service function ──────────────────────────────────────────────────

/** All question parts that become enabled once Part 1 is saved. */
const ALL_QUESTION_PARTS: PutInspectionPart1Result["unlockedParts"] = [
  "part2",
  "part3",
  "part4",
  "part5",
];

/**
 * Raw row shape returned by the public.save_inspection_part1 RPC.
 * Columns match the RETURNS TABLE definition in the SQL migration.
 */
interface SavePart1RpcRow {
  id: string;
  title: string;
  snapshot_version: number;
  client_updated_at: string;
  snapshot: Record<string, unknown>;
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return msg.includes("NOT_FOUND") || hint.includes("NOT_FOUND");
}

/**
 * Atomically saves Part 1 vehicle data to an existing inspection.
 *
 * When `dryRun` is `true`, all computation runs (visibility resolution, smart
 * pruning, title building) but the SQL RPC is **not** called. The response
 * uses the current `snapshotVersion` from the database so the client receives
 * a valid diff preview without bumping the version counter.
 *
 * Throws:
 * - `404 Not Found` when the inspection does not exist or belongs to a
 *   different user.
 * - `500 Internal Server Error` for unexpected database failures.
 */
export async function saveInspectionPart1(
  event: H3Event,
  userId: string,
  inspectionId: string,
  command: PutInspectionPart1Command,
  dryRun: boolean,
  requestId: string,
): Promise<PutInspectionPart1Result> {
  const client = serverSupabaseServiceRole(event);

  // ── 1. Fetch current snapshot to get runtime flags and existing answers ──
  const { data: existing, error: fetchError } = await client
    .from("inspections")
    .select("snapshot_version, snapshot, client_updated_at")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    console.error("[save-inspection-part1] snapshot fetch failed", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/part-1",
      requestId,
      userId,
      inspectionId,
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

  // ── 2. Extract runtime flags from the current snapshot ───────────────────
  const snapshot = existing.snapshot as Record<string, unknown>;
  const runtimeFlagsRaw = (snapshot.runtime_flags ?? {}) as Record<
    string,
    boolean
  >;
  const runtimeFlags: InspectionRuntimeFlagsDto = {
    chargingPortEquipped: runtimeFlagsRaw.chargingPortEquipped ?? false,
    evBatteryDocsAvailable: runtimeFlagsRaw.evBatteryDocsAvailable ?? false,
    turboEquipped: runtimeFlagsRaw.turboEquipped ?? false,
    mechanicalCompressorEquipped:
      runtimeFlagsRaw.mechanicalCompressorEquipped ?? false,
    importedFromEU: runtimeFlagsRaw.importedFromEU ?? false,
  };

  // ── 3. Resolve visibility & compute smart pruning ────────────────────────
  const { visibleGroupIds, visibleQuestionIds } = resolveVisibility(
    command,
    runtimeFlags,
  );

  const currentAnswers = (snapshot.answers ?? {}) as Record<string, string>;
  const currentQuestionNotes = (snapshot.question_notes ?? {}) as Record<
    string,
    string
  >;
  const pruning = applySmartPruning(
    currentAnswers,
    currentQuestionNotes,
    visibleQuestionIds,
  );

  // ── 4. Build title ────────────────────────────────────────────────────────
  const title = buildInspectionTitle(command);

  // ── 5. dryRun: return computed result without writing to DB ───────────────
  if (dryRun) {
    return {
      inspectionId,
      part1: {
        price: command.price,
        make: command.make,
        model: command.model,
        yearOfProduction: command.yearOfProduction,
        registrationNumber: command.registrationNumber,
        vinNumber: command.vinNumber,
        mileage: command.mileage,
        fuelType: command.fuelType,
        transmission: command.transmission,
        drive: command.drive,
        color: command.color,
        bodyType: command.bodyType,
        numberOfDoors: command.numberOfDoors,
        address: command.address,
        notes: command.notes,
      },
      title,
      unlockedParts: ALL_QUESTION_PARTS,
      visibleGroupIds,
      visibleQuestionIds,
      smartPruning: pruning,
      snapshotVersion: existing.snapshot_version,
      clientUpdatedAt: existing.client_updated_at,
    };
  }

  // ── 6. Call the SQL RPC to atomically persist Part 1 ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcError } = await (client as any).rpc(
    "save_inspection_part1",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_title: title,
      p_make: command.make,
      p_model: command.model,
      p_fuel_type: command.fuelType,
      p_transmission: command.transmission,
      p_drive: command.drive,
      p_body_type: command.bodyType,
      p_price: command.price,
      p_year_of_production: command.yearOfProduction,
      p_mileage: command.mileage,
      p_number_of_doors: command.numberOfDoors,
      p_registration_number: command.registrationNumber,
      p_vin_number: command.vinNumber,
      p_color: command.color,
      p_address: command.address,
      p_notes: command.notes,
      p_visible_group_ids: visibleGroupIds,
      p_visible_question_ids: visibleQuestionIds,
      p_removed_answer_ids: pruning.removedAnswerIds,
      p_removed_question_note_ids: pruning.removedQuestionNoteIds,
      p_client_updated_at: new Date().toISOString(),
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

    console.error("[save-inspection-part1] rpc call failed", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/part-1",
      requestId,
      userId,
      inspectionId,
      errorMessage: rpcError.message,
      errorCode: (rpcError as { code?: string }).code,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const rows = rpcData as SavePart1RpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[save-inspection-part1] rpc returned no rows", {
      endpoint: "PUT /api/v1/inspections/:inspectionId/part-1",
      requestId,
      userId,
      inspectionId,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while processing the request.",
    });
  }

  const row = rows[0]!;

  return {
    inspectionId,
    part1: {
      price: command.price,
      make: command.make,
      model: command.model,
      yearOfProduction: command.yearOfProduction,
      registrationNumber: command.registrationNumber,
      vinNumber: command.vinNumber,
      mileage: command.mileage,
      fuelType: command.fuelType,
      transmission: command.transmission,
      drive: command.drive,
      color: command.color,
      bodyType: command.bodyType,
      numberOfDoors: command.numberOfDoors,
      address: command.address,
      notes: command.notes,
    },
    title: row.title,
    unlockedParts: ALL_QUESTION_PARTS,
    visibleGroupIds,
    visibleQuestionIds,
    smartPruning: pruning,
    snapshotVersion: row.snapshot_version,
    clientUpdatedAt: row.client_updated_at,
  };
}
