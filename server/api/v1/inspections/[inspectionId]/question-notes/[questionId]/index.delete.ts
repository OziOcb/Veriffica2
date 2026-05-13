import { randomUUID } from "node:crypto";
import { getValidatedRouterParams, createError } from "h3";
import { getRequiredUserId } from "../../../../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../../../../utils/security/assert-mutation-origin";
import { deleteInspectionQuestionNote } from "../../../../../../utils/services/delete-inspection-question-note";
import { InspectionQuestionRouteParamsSchema } from "../../../../../../../shared/contracts/inspections";
import type { ApiSuccessResponseDto } from "~/types";
import type { DeleteInspectionQuestionNoteResult } from "../../../../../../../shared/contracts/inspections";

export default defineEventHandler(
  async (
    event,
  ): Promise<ApiSuccessResponseDto<DeleteInspectionQuestionNoteResult>> => {
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

    // ── Domain operation ───────────────────────────────────────────────────
    let result: DeleteInspectionQuestionNoteResult;
    try {
      result = await deleteInspectionQuestionNote(
        event,
        userId,
        inspectionId,
        questionId,
        requestId,
      );
    } catch (err) {
      if (typeof err === "object" && err !== null && "statusCode" in err) {
        throw err;
      }

      console.error(
        "[DELETE /api/v1/inspections/:inspectionId/question-notes/:questionId] unexpected error",
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
