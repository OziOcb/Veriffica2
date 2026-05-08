import { randomUUID } from "node:crypto";
import { readValidatedBody, setResponseStatus } from "h3";
import { getRequiredUserId } from "../../../utils/auth/get-required-user-id";
import { assertMutationOrigin } from "../../../utils/security/assert-mutation-origin";
import { createInspection } from "../../../utils/services/create-inspection";
import { CreateInspectionCommandSchema } from "../../../../shared/contracts/inspections";
import type {
  ApiSuccessResponseDto,
  CreatedInspectionDto,
  InspectionLimitsDto,
} from "~/types";

interface CreateInspectionResponseData {
  inspection: CreatedInspectionDto;
  limits: InspectionLimitsDto;
}

export default defineEventHandler(
  async (
    event,
  ): Promise<ApiSuccessResponseDto<CreateInspectionResponseData>> => {
    assertMutationOrigin(event);

    useRuntimeConfig(event);

    const userId = await getRequiredUserId(event);

    const body = await readValidatedBody(event, (raw) =>
      CreateInspectionCommandSchema.parse(raw),
    );

    const result = await createInspection(event, userId, body);

    setResponseStatus(event, 201);

    return {
      data: {
        inspection: result.inspection,
        limits: result.limits,
      },
      meta: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
      },
    };
  },
);
