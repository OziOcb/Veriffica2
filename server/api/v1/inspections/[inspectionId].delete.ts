import { randomUUID } from "node:crypto";
import { getValidatedRouterParams, readValidatedBody } from "h3";
import { getRequiredUserId } from "../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../utils/security/assert-mutation-origin";
import {
  assertRateLimit,
  getRateLimitKey,
} from "../../../utils/security/rate-limit";
import { deleteInspection } from "../../../utils/services/delete-inspection";
import {
  InspectionRouteParamsSchema,
  DeleteInspectionCommandSchema,
} from "../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto } from "~/types";

interface DeleteInspectionResponseData {
  deleted: true;
  inspectionId: string;
  freedSlots: 1;
}

export default defineEventHandler(
  async (
    event,
  ): Promise<ApiSuccessResponseDto<DeleteInspectionResponseData>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Security guards (run before any privileged operation) ──────────────
    assertMutationOrigin(event);
    assertRateLimit(event, getRateLimitKey(event));

    // ── Auth: resolve current user from SSR session ────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Input validation ───────────────────────────────────────────────────
    const { inspectionId } = await getValidatedRouterParams(event, (params) =>
      InspectionRouteParamsSchema.parse(params),
    );

    await readValidatedBody(event, (body) =>
      DeleteInspectionCommandSchema.parse(body),
    );

    // ── Domain operation ───────────────────────────────────────────────────
    let result;
    try {
      result = await deleteInspection(event, userId, inspectionId, requestId);
    } catch (err) {
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[DELETE /api/v1/inspections/:inspectionId] unexpected error",
        {
          requestId,
          userId,
          inspectionId,
          error: err,
        },
      );

      throw createError({
        statusCode: 500,
        statusMessage: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    // ── Response ───────────────────────────────────────────────────────────
    return {
      data: {
        deleted: true,
        inspectionId: result.inspectionId,
        freedSlots: result.freedSlots,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
