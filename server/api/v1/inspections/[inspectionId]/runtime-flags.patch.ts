import { randomUUID } from "node:crypto";
import {
  getValidatedRouterParams,
  getValidatedQuery,
  readBody,
  createError,
} from "h3";
import { getRequiredUserId } from "../../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../../utils/security/assert-mutation-origin";
import { patchInspectionRuntimeFlags } from "../../../../utils/services/patch-inspection-runtime-flags";
import {
  InspectionRouteParamsSchema,
  PatchInspectionRuntimeFlagsQuerySchema,
  PatchInspectionRuntimeFlagsCommandSchema,
} from "../../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto } from "~/types";
import type { PatchInspectionRuntimeFlagsResult } from "../../../../../shared/contracts/inspections";

export default defineEventHandler(
  async (
    event,
  ): Promise<ApiSuccessResponseDto<PatchInspectionRuntimeFlagsResult>> => {
    const requestId = randomUUID();

    useRuntimeConfig(event);

    // ── Security guards (run before any privileged operation) ──────────────
    assertMutationOrigin(event);

    // ── Auth: resolve current user from SSR session ────────────────────────
    const userId = await getRequiredUserId(event);

    // ── Route params validation → 400 ─────────────────────────────────────
    const { inspectionId } = await getValidatedRouterParams(event, (params) =>
      InspectionRouteParamsSchema.parse(params),
    );

    // ── Query validation → 400 ─────────────────────────────────────────────
    const { mode } = await getValidatedQuery(event, (query) =>
      PatchInspectionRuntimeFlagsQuerySchema.parse(query),
    );

    // ── Body validation: use safeParse to distinguish 400 vs 422 ──────────
    // 400: body is missing, not a JSON object, or cannot be read at all.
    // 422: body is valid JSON but fails the domain contract (unknown flags,
    //      empty patch, wrong types).
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
      PatchInspectionRuntimeFlagsCommandSchema.safeParse(rawBody);
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
    let result: PatchInspectionRuntimeFlagsResult;
    try {
      result = await patchInspectionRuntimeFlags(
        event,
        userId,
        inspectionId,
        command,
        mode,
        requestId,
      );
    } catch (err) {
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[PATCH /api/v1/inspections/:inspectionId/runtime-flags] unexpected error",
        {
          requestId,
          userId,
          inspectionId,
          mode,
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
