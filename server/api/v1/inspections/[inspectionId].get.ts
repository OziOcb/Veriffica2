import { randomUUID } from "node:crypto";
import { getValidatedRouterParams, getValidatedQuery } from "h3";
import { getRequiredUserId } from "../../../utils/auth/get-required-user-id";
import { getInspectionDetail } from "../../../utils/services/get-inspection-detail";
import {
  InspectionRouteParamsSchema,
  GetInspectionDetailQuerySchema,
} from "../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto, InspectionDetailDto } from "~/types";

export default defineEventHandler(
  async (event): Promise<ApiSuccessResponseDto<InspectionDetailDto>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Auth ───────────────────────────────────────────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Input validation ───────────────────────────────────────────────────
    const { inspectionId } = await getValidatedRouterParams(event, (params) =>
      InspectionRouteParamsSchema.parse(params),
    );

    const query = await getValidatedQuery(event, (raw) =>
      GetInspectionDetailQuerySchema.parse(raw),
    );

    // ── Domain operation ───────────────────────────────────────────────────
    let result;
    try {
      result = await getInspectionDetail(
        event,
        userId,
        inspectionId,
        query,
        requestId,
      );
    } catch (err) {
      // Re-throw H3 errors (404, 500, etc.) as-is. Log unexpected errors with
      // enough context to debug without leaking sensitive data.
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[GET /api/v1/inspections/:inspectionId] unexpected error",
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
      data: result.inspection,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
