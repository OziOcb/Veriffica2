import { serverSupabaseServiceRole } from "#supabase/server";
import { createError } from "h3";
import type { H3Event } from "h3";
import type { Json } from "~/db/database.types";
import type {
  CreatedInspectionDto,
  InspectionLimitsDto,
  InspectionMode,
  InspectionStatus,
} from "~/types";
import type { CreateInspectionCommand } from "../../../shared/contracts/inspections";

const MAX_INSPECTIONS = 2;

/**
 * Result returned by the create-inspection service to the POST handler.
 */
export interface CreateInspectionResult {
  inspection: CreatedInspectionDto;
  limits: InspectionLimitsDto;
}

/**
 * Raw row shape returned by the public.create_inspection RPC.
 * Columns match the RETURNS TABLE definition in the SQL migration.
 */
interface CreateInspectionRpcRow {
  id: string;
  title: string;
  status: string;
  question_bank_version: string;
  snapshot_schema_version: string;
  snapshot_version: number;
  client_updated_at: string;
  created_at: string;
  updated_at: string;
  snapshot: Json;
  current_count: number;
}

/**
 * Minimal runtime flags shape extracted from the empty canonical snapshot.
 * All flags are false at creation time.
 */
const EMPTY_RUNTIME_FLAGS: CreatedInspectionDto["runtimeFlags"] = {
  chargingPortEquipped: false,
  evBatteryDocsAvailable: false,
  turboEquipped: false,
  mechanicalCompressorEquipped: false,
  importedFromEU: false,
};

function isInspectionLimitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const msg = (error as { message?: string }).message ?? "";
  const hint = (error as { hint?: string }).hint ?? "";
  return (
    msg.includes("INSPECTION_LIMIT_REACHED") ||
    hint.includes("INSPECTION_LIMIT_REACHED")
  );
}

function mapRpcRowToCreatedInspection(
  row: CreateInspectionRpcRow,
): CreatedInspectionDto {
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
    part1: null,
    runtimeFlags: EMPTY_RUNTIME_FLAGS,
    answers: {},
    questionNotes: {},
    globalNotes: "",
    visibleGroupIds: [],
    visibleQuestionIds: [],
    progress: {
      answeredQuestions: 0,
      visibleQuestions: 0,
      completionRate: 0,
    },
    scoreDistribution: {
      yes: 0,
      no: 0,
      dontKnow: 0,
    },
    mode: "editable" as InspectionMode,
  };
}

/**
 * Atomically creates a new draft inspection for the given user.
 *
 * Delegates to the `public.create_inspection` SQL function which holds an
 * advisory lock for the duration of the transaction, enforcing the 2-inspection
 * limit without a race condition.
 *
 * NOTE: Uses the service-role client because RLS denies direct INSERT to
 * public.inspections for all authenticated users. The SQL function itself is
 * SECURITY DEFINER and is only executable by service_role.
 *
 * Throws:
 * - `409 Conflict` with code `INSPECTION_LIMIT_REACHED` when the user already
 *   holds 2 inspections.
 * - `500 Internal Server Error` for unexpected DB failures.
 */
export async function createInspection(
  event: H3Event,
  userId: string,
  command: CreateInspectionCommand,
): Promise<CreateInspectionResult> {
  const client = serverSupabaseServiceRole(event);

  // The `create_inspection` function was added in a migration after the
  // database types snapshot was generated, so the RPC name is not yet in
  // the generated types. Cast to `any` until types are regenerated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc("create_inspection", {
    p_user_id: userId,
    p_client_created_at: command.clientCreatedAt,
  });

  if (error) {
    if (isInspectionLimitError(error)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Conflict",
        data: {
          error: {
            code: "INSPECTION_LIMIT_REACHED",
            message: "You have reached the maximum number of inspections.",
          },
        },
      });
    }

    console.error("[create-inspection] rpc call failed", {
      endpoint: "POST /api/v1/inspections",
      errorType: "create-inspection-rpc",
      userId,
      error: error.message,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "Could not create inspection.",
    });
  }

  // The RPC returns an array with exactly one row (RETURNS TABLE).
  const rows = data as CreateInspectionRpcRow[] | null;
  if (!rows || rows.length === 0) {
    console.error("[create-inspection] rpc returned no rows", {
      endpoint: "POST /api/v1/inspections",
      userId,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "Could not create inspection.",
    });
  }

  // rows.length === 0 is already guarded above; non-null assertion is safe.
  const row = rows[0]!;
  const currentInspections = row.current_count;
  const remaining = Math.max(0, MAX_INSPECTIONS - currentInspections);

  return {
    inspection: mapRpcRowToCreatedInspection(row),
    limits: {
      maxInspections: MAX_INSPECTIONS,
      currentInspections,
      remaining,
    },
  };
}
