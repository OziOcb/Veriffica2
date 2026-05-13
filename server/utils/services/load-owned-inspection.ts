import { serverSupabaseServiceRole } from "#supabase/server";
import { createError } from "h3";
import type { H3Event } from "h3";
import type { Tables } from "~/db/database.types";

/**
 * Minimal columns needed for lifecycle operations (finalize / reopen) and
 * the summary endpoint. Callers that need Part 1 projection columns or
 * additional snapshot data should query directly.
 */
export type OwnedInspectionRow = Pick<
  Tables<"inspections">,
  | "id"
  | "title"
  | "status"
  | "snapshot"
  | "snapshot_version"
  | "completed_at"
  | "question_bank_version"
>;

/**
 * Fetches a minimal owned inspection row for the authenticated user.
 *
 * Uses the service-role client with an explicit `user_id` filter because RLS
 * is disabled on public.inspections (migration
 * 20260501000100_disable_app_table_rls.sql).
 *
 * Returns a 404 for both "inspection not found" and "wrong owner" cases to
 * prevent resource-existence leakage.
 *
 * @param endpoint - Caller endpoint label used in structured error logs.
 * @throws 404 Not Found when the inspection does not exist or belongs to
 *   another user.
 * @throws 500 Internal Server Error for unexpected database failures.
 */
export async function loadOwnedInspection(
  event: H3Event,
  userId: string,
  inspectionId: string,
  endpoint: string,
  requestId: string,
): Promise<OwnedInspectionRow> {
  const client = serverSupabaseServiceRole(event);

  const { data, error } = await client
    .from("inspections")
    .select(
      "id, title, status, snapshot, snapshot_version, completed_at, question_bank_version",
    )
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[load-owned-inspection] DB query failed", {
      endpoint,
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

  return data as OwnedInspectionRow;
}
