import { serverSupabaseUser } from "#supabase/server";
import type { H3Event } from "h3";
import { getRequestHeader, createError } from "h3";

/**
 * Returns the authenticated user's UUID from the current Supabase SSR session.
 *
 * Throws a `401 Unauthorized` H3 error when no active session exists or when
 * the session cannot be resolved to a reliable user identity. The `userId` is
 * always sourced from the server-side session — it is never read from request
 * params, query, or body.
 */
export async function getRequiredUserId(event: H3Event): Promise<string> {
  const user = await serverSupabaseUser(event);

  // Development helper: allow tests or Postman to impersonate a user by
  // sending the `x-dev-user-id` header when NODE_ENV !== 'production'. This
  // keeps the production path strict while making local testing convenient.
  if (process.env.NODE_ENV !== "production") {
    const devUserId = getRequestHeader(event, "x-dev-user-id");
    if (devUserId) {
      return devUserId;
    }
  }

  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: "Unauthorized",
      message: "A valid session is required to perform this action.",
    });
  }

  return user.id;
}
