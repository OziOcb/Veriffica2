import { randomUUID } from "node:crypto";
import type { GetCurrentUserPreferencesResponseDto } from "~/types";
import { getRequiredUserId } from "../../../utils/auth/get-required-user-id";
import { getCurrentUserPreferences } from "../../../utils/services/get-current-user-preferences";

export default defineEventHandler(
  async (event): Promise<GetCurrentUserPreferencesResponseDto> => {
    // Explicitly read runtime config so Nitro respects env overrides.
    useRuntimeConfig(event);

    const userId = await getRequiredUserId(event);
    const preferences = await getCurrentUserPreferences(event, userId);

    return {
      data: preferences,
      meta: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
  },
);
