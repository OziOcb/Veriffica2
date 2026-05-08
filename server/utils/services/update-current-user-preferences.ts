import { serverSupabaseServiceRole } from "#supabase/server";
import { createError } from "h3";
import type { H3Event } from "h3";
import type { PatchCurrentUserPreferencesCommand } from "../../../shared/contracts/current-user-preferences";
import type { Tables, TablesUpdate } from "~/db/database.types";
import type { PatchCurrentUserPreferencesResultDto } from "~/types";

type UserPreferencesRow = Tables<"user_preferences">;
type UserPreferencesUpdatePayload = Pick<
  TablesUpdate<"user_preferences">,
  "theme" | "font_scale" | "hide_inspection_intro"
>;
type UserPreferencesPatchRow = Pick<
  UserPreferencesRow,
  "user_id" | "theme" | "font_scale" | "hide_inspection_intro" | "updated_at"
>;

function isHttpError(error: unknown): error is { statusCode: number } {
  return typeof error === "object" && error !== null && "statusCode" in error;
}

function buildUserPreferencesUpdatePayload(
  command: PatchCurrentUserPreferencesCommand,
): UserPreferencesUpdatePayload {
  const updatePayload: UserPreferencesUpdatePayload = {};

  if (command.theme !== undefined) {
    updatePayload.theme = command.theme;
  }

  if (command.fontScale !== undefined) {
    updatePayload.font_scale = command.fontScale;
  }

  if (command.hideInspectionIntro !== undefined) {
    updatePayload.hide_inspection_intro = command.hideInspectionIntro;
  }

  return updatePayload;
}

function mapUserPreferencesPatchRow(
  row: UserPreferencesPatchRow,
): PatchCurrentUserPreferencesResultDto {
  return {
    userId: row.user_id,
    theme: row.theme as PatchCurrentUserPreferencesResultDto["theme"],
    fontScale:
      row.font_scale as PatchCurrentUserPreferencesResultDto["fontScale"],
    hideInspectionIntro: row.hide_inspection_intro ?? false,
    updatedAt: row.updated_at,
  };
}

/**
 * Updates the authenticated user's mutable application preferences through a
 * trusted server-side write path.
 */
export async function updateCurrentUserPreferences(
  event: H3Event,
  userId: string,
  command: PatchCurrentUserPreferencesCommand,
  requestId: string,
): Promise<PatchCurrentUserPreferencesResultDto> {
  const updatePayload = buildUserPreferencesUpdatePayload(command);

  if (Object.keys(updatePayload).length === 0) {
    console.error("[update-current-user-preferences] empty patch payload", {
      endpoint: "PATCH /api/v1/me/preferences",
      requestId,
      userId,
      errorType: "validation",
    });

    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "At least one preference field must be provided.",
    });
  }

  const client = serverSupabaseServiceRole(event);

  try {
    const result = await client
      .from("user_preferences")
      .update(updatePayload)
      .eq("user_id", userId)
      .select("user_id, theme, font_scale, hide_inspection_intro, updated_at")
      .single();

    const row = result.data as UserPreferencesPatchRow | null;
    const error = result.error;

    if (error || !row) {
      console.error(
        "[update-current-user-preferences] user_preferences update failed",
        {
          endpoint: "PATCH /api/v1/me/preferences",
          requestId,
          userId,
          errorType: "preferences-update",
          error: error?.message ?? "no row returned",
          fields: Object.keys(updatePayload),
        },
      );

      throw createError({
        statusCode: 500,
        statusMessage: "Internal Server Error",
        message: "Could not update user preferences.",
      });
    }

    return mapUserPreferencesPatchRow(row);
  } catch (error: unknown) {
    if (isHttpError(error)) {
      throw error;
    }

    console.error(
      "[update-current-user-preferences] unexpected preferences update error",
      {
        endpoint: "PATCH /api/v1/me/preferences",
        requestId,
        userId,
        errorType: "unexpected",
        fields: Object.keys(updatePayload),
        error,
      },
    );

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "Could not update user preferences.",
    });
  }
}
