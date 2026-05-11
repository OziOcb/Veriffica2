import { randomUUID } from "node:crypto";
import {
  getValidatedRouterParams,
  getValidatedQuery,
  setResponseHeader,
} from "h3";
import { getRequiredUserId } from "../../../../../../utils/auth/get-required-user-id";
import { getInspectionPartQuestions } from "../../../../../../utils/services/get-inspection-part-questions";
import {
  InspectionPartRouteParamsSchema,
  GetInspectionPartQuestionsQuerySchema,
} from "../../../../../../../shared/contracts/inspections";
import type {
  ApiSuccessResponseDto,
  GetInspectionPartQuestionsResultDto,
} from "~/types";

export default defineEventHandler(
  async (
    event,
  ): Promise<ApiSuccessResponseDto<GetInspectionPartQuestionsResultDto>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // Prevent CDN / shared caching of session-scoped responses.
    setResponseHeader(event, "Cache-Control", "private, no-store");

    // ── Auth ───────────────────────────────────────────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Input validation ───────────────────────────────────────────────────
    const { inspectionId, partId } = await getValidatedRouterParams(
      event,
      (params) => InspectionPartRouteParamsSchema.parse(params),
    );

    const query = await getValidatedQuery(event, (raw) =>
      GetInspectionPartQuestionsQuerySchema.parse(raw),
    );

    const include = query.include ?? [];
    const expansion = {
      includeAnswers: include.includes("answers"),
      includeNotes: include.includes("notes"),
      includeExplanations: include.includes("explanations"),
    };

    // ── Domain operation ───────────────────────────────────────────────────
    let result;
    try {
      result = await getInspectionPartQuestions(
        event,
        userId,
        inspectionId,
        partId,
        expansion,
        requestId,
      );
    } catch (err) {
      // Re-throw H3 errors (400, 404, 422, 500, etc.) as-is.
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[GET /api/v1/inspections/:inspectionId/parts/:partId/questions] unexpected error",
        {
          requestId,
          userId,
          inspectionId,
          partId,
          include,
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
      data: result.data,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
