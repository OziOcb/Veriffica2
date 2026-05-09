import { serverSupabaseServiceRole } from "#supabase/server";
import { createError } from "h3";
import type { H3Event } from "h3";

export interface DeleteInspectionResult {
  inspectionId: string;
  freedSlots: 1;
}

/**
 * Performs a hard delete of a single inspection, verifying that it belongs to
 * the authenticated user before removing it.
 *
 * Uses the service-role client with an explicit `user_id` filter because RLS
 * is disabled on public.inspections (migration
 * 20260501000100_disable_app_table_rls.sql).
 *
 * The delete is attempted directly through the Supabase client. If the
 * private.delete_inspection SQL function is needed for lock detection
 * (NOWAIT semantics), it can be invoked via supabase.rpc once PostgREST
 * exposes the private schema. For the MVP, a direct DELETE with ownership
 * filter provides sufficient safety.
 *
 * @throws 404 Not Found when the inspection does not exist or belongs to
 *   another user. Identical response for both cases to prevent resource
 *   existence leakage.
 * @throws 500 Internal Server Error for unexpected database failures.
 */
export async function deleteInspection(
  event: H3Event,
  userId: string,
  inspectionId: string,
  requestId: string,
): Promise<DeleteInspectionResult> {
  const client = serverSupabaseServiceRole(event);

  // Verify ownership before deleting. We use a separate SELECT so we can
  // distinguish "not found / wrong user" (404) from a DB error (500).
  const { data: existing, error: selectError } = await client
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("[delete-inspection] ownership check failed", {
      endpoint: "DELETE /api/v1/inspections/:inspectionId",
      requestId,
      userId,
      inspectionId,
      errorMessage: selectError.message,
      errorCode: selectError.code,
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

  // Ownership confirmed — perform the hard delete.
  const { error: deleteError } = await client
    .from("inspections")
    .delete()
    .eq("id", inspectionId)
    .eq("user_id", userId);

  if (deleteError) {
    console.error("[delete-inspection] DELETE query failed", {
      endpoint: "DELETE /api/v1/inspections/:inspectionId",
      requestId,
      userId,
      inspectionId,
      errorMessage: deleteError.message,
      errorCode: deleteError.code,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while deleting the inspection.",
    });
  }

  return { inspectionId, freedSlots: 1 };
}
