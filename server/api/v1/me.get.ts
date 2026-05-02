import { randomUUID } from "node:crypto";
import type { GetCurrentUserResponseDto } from "~/types";
import { getCurrentUserAccount } from "../../utils/services/get-current-user-account";

export default defineEventHandler(
  async (event): Promise<GetCurrentUserResponseDto> => {
    // Explicitly read runtime config so Nitro respects env overrides.
    useRuntimeConfig(event);

    const account = await getCurrentUserAccount(event);

    return {
      data: account,
      meta: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
  },
);
