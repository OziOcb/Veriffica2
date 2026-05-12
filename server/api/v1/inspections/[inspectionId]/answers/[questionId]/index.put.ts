import { randomUUID } from "node:crypto";
import { getValidatedRouterParams, readBody, createError } from "h3";
import { getRequiredUserId } from "../../../../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../../../../utils/security/assert-mutation-origin";
import { saveInspectionAnswer } from "../../../../../../utils/services/save-inspection-answer";
import {
  InspectionQuestionRouteParamsSchema,
  PutInspectionAnswerCommandSchema,
} from "../../../../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto } from "~/types";
import type { PutInspectionAnswerResult } from "../../../../../../../shared/contracts/inspections";

export default defineEventHandler(
  async (event): Promise<ApiSuccessResponseDto<PutInspectionAnswerResult>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Security guards ────────────────────────────────────────────────────
    assertMutationOrigin(event);

    // ── Auth ───────────────────────────────────────────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Route params validation → 400 ─────────────────────────────────────
    const { inspectionId, questionId } = await getValidatedRouterParams(
      event,
      (params) => InspectionQuestionRouteParamsSchema.parse(params),
    );

    // ── Body validation: distinguish 400 (transport) from 422 (domain) ────
    // 400: body is missing, not a JSON object, or cannot be read at all.
    // 422: body is valid JSON but fails the domain contract.
    let rawBody: unknown;
    try {
      rawBody = await readBody(event);
    } catch {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: { code: "BAD_REQUEST" },
        message: "Request body is missing or contains invalid JSON.",
      });
    }

    if (
      rawBody === null ||
      rawBody === undefined ||
      typeof rawBody !== "object" ||
      Array.isArray(rawBody)
    ) {
      throw createError({
        statusCode: 400,
        statusMessage: "Bad Request",
        data: { code: "BAD_REQUEST" },
        message: "Request body must be a JSON object.",
      });
    }

    const parseResult = PutInspectionAnswerCommandSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const { fieldErrors, formErrors } = parseResult.error.flatten();
      throw createError({
        statusCode: 422,
        statusMessage: "Unprocessable Entity",
        data: {
          code: "VALIDATION_ERROR",
          details: [
            ...formErrors.map((msg) => ({ field: "_body", message: msg })),
            ...Object.entries(fieldErrors).flatMap(([field, messages]) =>
              (messages ?? []).map((message) => ({ field, message })),
            ),
          ],
        },
        message: "Request body failed validation.",
      });
    }

    const command = parseResult.data;

    // ── Domain operation ───────────────────────────────────────────────────
    let result: PutInspectionAnswerResult;
    try {
      result = await saveInspectionAnswer(
        event,
        userId,
        inspectionId,
        questionId,
        command,
        requestId,
      );
    } catch (err) {
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[PUT /api/v1/inspections/:inspectionId/answers/:questionId] unexpected error",
        {
          requestId,
          userId,
          inspectionId,
          questionId,
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
      data: result,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
