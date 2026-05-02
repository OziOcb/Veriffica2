import { serverSupabaseClient } from "#supabase/server";
import type { H3Event } from "h3";
import type { CurrentUserAccountDto, ProfileDto } from "~/types";
import { DEFAULT_USER_ID } from "~/db/supabase.client";
import type { Tables } from "~/db/database.types";

type ProfileRow = Tables<"profiles">;

/**
 * Fetches the public.profiles record for the current user and maps it into a
 * CurrentUserAccountDto.
 *
 * NOTE: Auth is not implemented yet. The userId is hardcoded to DEFAULT_USER_ID
 * from ~/db/supabase.client and stub values are used for auth-sourced fields.
 * This will be replaced with a real session-based lookup once auth is wired up.
 *
 * Throws 500 if the profiles record is missing — its existence is enforced
 * by a DB trigger and is treated as a data invariant.
 */
export async function getCurrentUserAccount(
  event: H3Event,
): Promise<CurrentUserAccountDto> {
  const userId = DEFAULT_USER_ID;
  const client = await serverSupabaseClient(event);

  const result = await client
    .from("profiles")
    .select("user_id, created_at, updated_at")
    .eq("user_id", userId)
    .single();

  const profileRow = result.data as Pick<
    ProfileRow,
    "user_id" | "created_at" | "updated_at"
  > | null;
  const error = result.error;

  if (error || !profileRow) {
    console.error("[get-current-user-account] profiles fetch failed", {
      endpoint: "GET /api/v1/me",
      errorType: "profile-fetch",
      userId,
      error: error?.message ?? "no row returned",
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "Could not load user profile.",
    });
  }

  const profile: ProfileDto = {
    userId: profileRow.user_id,
    createdAt: profileRow.created_at,
    updatedAt: profileRow.updated_at,
  };

  // TODO: replace stub user fields with real Supabase Auth data once auth is
  // implemented (email and actual createdAt from auth.users).
  return {
    user: {
      id: userId,
      email: "dev@local.dev",
      createdAt: profileRow.created_at,
    },
    profile,
  };
}
