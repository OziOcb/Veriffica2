import { randomUUID } from "node:crypto";
import { getValidatedRouterParams, readBody, createError } from "h3";
import { getRequiredUserId } from "../../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../../utils/security/assert-mutation-origin";
import { saveInspectionGlobalNotes } from "../../../../utils/services/save-inspection-global-notes";
import {
  InspectionRouteParamsSchema,
  PutInspectionGlobalNotesCommandSchema,
} from "../../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto } from "~/types";
import type { PutInspectionGlobalNotesResult } from "../../../../../shared/contracts/inspections";

export default defineEventHandler(
  async (
    event,
  ): Promise<ApiSuccessResponseDto<PutInspectionGlobalNotesResult>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Security guards ────────────────────────────────────────────────────
    assertMutationOrigin(event);

    // ── Auth ───────────────────────────────────────────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Route params validation → 400 ─────────────────────────────────────
    const { inspectionId } = await getValidatedRouterParams(event, (params) =>
      InspectionRouteParamsSchema.parse(params),
    );

    // ── Body validation: distinguish 400 (transport) from 422 (domain) ────
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

    const parseResult =
      PutInspectionGlobalNotesCommandSchema.safeParse(rawBody);
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
    let result: PutInspectionGlobalNotesResult;
    try {
      result = await saveInspectionGlobalNotes(
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
        "[PUT /api/v1/inspections/:inspectionId/global-notes] unexpected error",
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
      data: result,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  },
);
