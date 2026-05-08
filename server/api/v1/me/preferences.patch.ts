import { randomUUID } from "node:crypto";
import { PatchCurrentUserPreferencesCommandSchema } from "../../../../shared/contracts/current-user-preferences";
import { getRequiredUserId } from "../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../utils/security/assert-mutation-origin";
import { updateCurrentUserPreferences } from "../../../utils/services/update-current-user-preferences";
import type { PatchCurrentUserPreferencesResponseDto } from "~/types";

export default defineEventHandler(
  async (event): Promise<PatchCurrentUserPreferencesResponseDto> => {
    // Explicitly read runtime config so Nitro respects env overrides.
    useRuntimeConfig(event);

    const requestId = randomUUID();

    assertMutationOrigin(event);

    const userId = await getRequiredUserId(event);
    const command = await readValidatedBody(event, (body) =>
      PatchCurrentUserPreferencesCommandSchema.parse(body),
    );
    const preferences = await updateCurrentUserPreferences(
      event,
      userId,
      command,
      requestId,
    );

    return {
      data: preferences,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
