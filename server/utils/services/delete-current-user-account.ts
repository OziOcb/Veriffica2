import { serverSupabaseServiceRole } from "#supabase/server";
import type { H3Event } from "h3";

/**
 * Performs a hard delete of the authenticated user's account via the Supabase
 * Auth Admin API.
 *
 * Responsibility boundaries:
 * - Uses service-role client exclusively — never the user-scoped client.
 * - Does NOT perform manual deletes on public.profiles, public.user_preferences
 *   or public.inspections; existing ON DELETE CASCADE constraints handle them.
 * - Does NOT touch HTTP session state; the caller (handler) is responsible for
 *   clearing SSR cookies after this function returns successfully.
 *
 * @throws 409 Conflict when the Admin API rejects the delete or returns an
 *   unexpected state.
 * @throws 500 Internal Server Error for unexpected infrastructure failures.
 */
export async function deleteCurrentUserAccount(
  event: H3Event,
  userId: string,
  requestId: string,
): Promise<void> {
  const client = serverSupabaseServiceRole(event);

  const { error } = await client.auth.admin.deleteUser(
    userId,
    /* shouldSoftDelete */ false,
  );

  if (error) {
    console.error("[delete-current-user-account] admin deleteUser failed", {
      endpoint: "DELETE /api/v1/me",
      requestId,
      userId,
      errorMessage: error.message,
      errorStatus: error.status,
    });

    // A known Admin API error means the delete flow cannot complete safely.
    // Map to 409 so the caller can distinguish it from an unexpected 500.
    throw createError({
      statusCode: 409,
      statusMessage: "Conflict",
      message: "Account deletion could not be completed. Please try again.",
    });
  }
}
