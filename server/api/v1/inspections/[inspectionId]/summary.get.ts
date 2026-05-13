import { randomUUID } from "node:crypto";
import {
  getValidatedRouterParams,
  getValidatedQuery,
  setResponseHeader,
} from "h3";
import { getRequiredUserId } from "../../../../utils/auth/get-required-user-id";
import { getInspectionSummary } from "../../../../utils/services/get-inspection-summary";
import {
  InspectionRouteParamsSchema,
  GetInspectionSummaryQuerySchema,
} from "../../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto, InspectionSummaryDto } from "~/types";

export default defineEventHandler(
  async (event): Promise<ApiSuccessResponseDto<InspectionSummaryDto>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Auth ───────────────────────────────────────────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Input validation ───────────────────────────────────────────────────
    const { inspectionId } = await getValidatedRouterParams(event, (params) =>
      InspectionRouteParamsSchema.parse(params),
    );

    const queryResult = GetInspectionSummaryQuerySchema.safeParse(
      await getValidatedQuery(event, (raw) => raw),
    );

    if (!queryResult.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        message: queryResult.error.issues.map((e) => e.message).join("; "),
      });
    }

    const query = queryResult.data;

    // ── Domain operation ───────────────────────────────────────────────────
    let result;
    try {
      result = await getInspectionSummary(
        event,
        userId,
        inspectionId,
        query,
        requestId,
      );
    } catch (err) {
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[GET /api/v1/inspections/:inspectionId/summary] unexpected error",
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
    setResponseHeader(event, "Cache-Control", "private, no-store");

    return {
      data: result.summary,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
