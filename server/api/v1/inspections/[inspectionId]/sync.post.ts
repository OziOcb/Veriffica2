import { randomUUID } from "node:crypto";
import {
  getValidatedRouterParams,
  getValidatedQuery,
  readBody,
  createError,
  setResponseStatus,
} from "h3";
import { getRequiredUserId } from "../../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../../utils/security/assert-mutation-origin";
import { syncInspection } from "../../../../utils/services/sync-inspection";
import {
  InspectionRouteParamsSchema,
  PostInspectionSyncQuerySchema,
  SyncInspectionCommandSchema,
} from "../../../../../shared/contracts/inspections";
import type {
  SyncInspectionResponseDto,
  SyncInspectionConflictResponseDto,
} from "~/types";

export default defineEventHandler(
  async (
    event,
  ): Promise<SyncInspectionResponseDto | SyncInspectionConflictResponseDto> => {
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
    // `strategy` is optional; when present it must be `client_wins`.
    await getValidatedQuery(event, (query) =>
      PostInspectionSyncQuerySchema.parse(query),
    );

    // ── Body validation: distinguish 400 (malformed JSON) from 422 (contract) ─
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

    const parseResult = SyncInspectionCommandSchema.safeParse(rawBody);
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
    let serviceResult: Awaited<ReturnType<typeof syncInspection>>;
    try {
      serviceResult = await syncInspection(
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
        "[POST /api/v1/inspections/:inspectionId/sync] unexpected error",
        {
          requestId,
          userId,
          inspectionId,
          baseSnapshotVersion: command.baseSnapshotVersion,
          error: err,
        },
      );

      throw createError({
        statusCode: 500,
        statusMessage: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    const meta = {
      requestId,
      timestamp: new Date().toISOString(),
    };

    // ── Conflict response: 409 with SYNC_CONFLICT envelope ─────────────────
    if (serviceResult.type === "conflict") {
      setResponseStatus(event, 409);
      return {
        error: {
          code: "SYNC_CONFLICT",
          message:
            "The inspection changed since the provided base snapshot version.",
          details: [
            {
              field: "baseSnapshotVersion",
              message: "Refresh local state and retry.",
            },
          ],
        },
        data: {
          canonicalInspection: {
            id: serviceResult.canonicalId,
            snapshotVersion: serviceResult.canonicalSnapshotVersion,
            clientUpdatedAt: serviceResult.canonicalClientUpdatedAt,
          },
        },
        meta,
      } satisfies SyncInspectionConflictResponseDto;
    }

    // ── Success response: 200 OK ───────────────────────────────────────────
    return {
      data: serviceResult.result,
      meta,
    } satisfies SyncInspectionResponseDto;
  },
);
