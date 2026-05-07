import { serverSupabaseClient } from "#supabase/server";
import type { H3Event } from "h3";
import { createError } from "h3";
import type { Tables } from "~/db/database.types";
import type { UserPreferencesDto } from "~/types";

type UserPreferencesRow = Tables<"user_preferences">;

/**
 * Fetches the public.user_preferences record for the current user and maps it
 * into a UserPreferencesDto.
 *
 * Uses the session-scoped Supabase client so the RLS `select_own` policy is
 * applied automatically — no service-role escalation needed.
 *
 * Throws 500 if the record is missing — its existence is enforced by a DB
 * trigger and is treated as a data invariant, not a 404.
 */
export async function getCurrentUserPreferences(
  event: H3Event,
  userId: string,
): Promise<UserPreferencesDto> {
  const client = await serverSupabaseClient(event);

  const result = await client
    .from("user_preferences")
    .select(
      "user_id, theme, font_scale, hide_inspection_intro, created_at, updated_at",
    )
    .eq("user_id", userId)
    .single();

  const row = result.data as Pick<
    UserPreferencesRow,
    | "user_id"
    | "theme"
    | "font_scale"
    | "hide_inspection_intro"
    | "created_at"
    | "updated_at"
  > | null;
  const error = result.error;

  if (error || !row) {
    console.error(
      "[get-current-user-preferences] user_preferences fetch failed",
      {
        endpoint: "GET /api/v1/me/preferences",
        errorType: "user-preferences-fetch",
        userId,
        error: error?.message ?? "no row returned",
      },
    );

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "Could not load user preferences.",
    });
  }

  return {
    userId: row.user_id,
    theme: row.theme as UserPreferencesDto["theme"],
    fontScale: row.font_scale as UserPreferencesDto["fontScale"],
    hideInspectionIntro: row.hide_inspection_intro ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
