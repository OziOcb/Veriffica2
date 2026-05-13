import { randomUUID } from "node:crypto";
import { getValidatedRouterParams, setResponseHeader } from "h3";
import { getRequiredUserId } from "../../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../../utils/security/assert-mutation-origin";
import { reopenInspection } from "../../../../utils/services/reopen-inspection";
import {
  InspectionRouteParamsSchema,
  ReopenInspectionCommandSchema,
} from "../../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto, ReopenInspectionResultDto } from "~/types";

export default defineEventHandler(
  async (event): Promise<ApiSuccessResponseDto<ReopenInspectionResultDto>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Security guards ────────────────────────────────────────────────────
    assertMutationOrigin(event);

    // ── Auth ───────────────────────────────────────────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Route params ───────────────────────────────────────────────────────
    const { inspectionId } = await getValidatedRouterParams(event, (params) =>
      InspectionRouteParamsSchema.parse(params),
    );

    // ── Body validation ────────────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await readBody(event);
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        message: "Request body must be valid JSON.",
      });
    }

    const bodyResult = ReopenInspectionCommandSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        message: bodyResult.error.issues.map((e) => e.message).join("; "),
      });
    }

    const command = bodyResult.data;

    // ── Domain operation ───────────────────────────────────────────────────
    let result;
    try {
      result = await reopenInspection(
        event,
        userId,
        inspectionId,
        command,
        requestId,
      );
    } catch (err) {
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[POST /api/v1/inspections/:inspectionId/reopen] unexpected error",
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
      data: {
        inspectionId: result.inspectionId,
        status: "draft",
        completedAt: null,
        mode: "editable",
        snapshotVersion: result.snapshotVersion,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
