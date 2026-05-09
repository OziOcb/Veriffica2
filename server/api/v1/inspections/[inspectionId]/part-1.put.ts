import { randomUUID } from "node:crypto";
import {
  getValidatedRouterParams,
  getValidatedQuery,
  readValidatedBody,
  createError,
} from "h3";
import { getRequiredUserId } from "../../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../../utils/security/assert-mutation-origin";
import { saveInspectionPart1 } from "../../../../utils/services/save-inspection-part1";
import {
  InspectionRouteParamsSchema,
  PutInspectionPart1QuerySchema,
  PutInspectionPart1CommandSchema,
} from "../../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto } from "~/types";
import type { PutInspectionPart1Result } from "../../../../../shared/contracts/inspections";

export default defineEventHandler(
  async (event): Promise<ApiSuccessResponseDto<PutInspectionPart1Result>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Security guards (run before any privileged operation) ──────────────
    assertMutationOrigin(event);

    // ── Auth: resolve current user from SSR session ────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Input validation ───────────────────────────────────────────────────
    const { inspectionId } = await getValidatedRouterParams(event, (params) =>
      InspectionRouteParamsSchema.parse(params),
    );

    const { dryRun } = await getValidatedQuery(event, (query) =>
      PutInspectionPart1QuerySchema.parse(query),
    );

    const command = await readValidatedBody(event, (body) =>
      PutInspectionPart1CommandSchema.parse(body),
    );

    // ── Domain operation ───────────────────────────────────────────────────
    let result: PutInspectionPart1Result;
    try {
      result = await saveInspectionPart1(
        event,
        userId,
        inspectionId,
        command,
        dryRun,
        requestId,
      );
    } catch (err) {
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[PUT /api/v1/inspections/:inspectionId/part-1] unexpected error",
        {
          requestId,
          userId,
          inspectionId,
          dryRun,
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
      data: result,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
