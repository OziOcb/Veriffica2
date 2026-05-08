import { randomUUID } from "node:crypto";
import { getValidatedQuery } from "h3";
import { getRequiredUserId } from "../../../utils/auth/get-required-user-id";
import { listUserInspections } from "../../../utils/services/list-user-inspections";
import { ListInspectionsQuerySchema } from "../../../../shared/contracts/inspections";
import type { ApiListResponseDto, InspectionListItemDto } from "~/types";

export default defineEventHandler(
  async (event): Promise<ApiListResponseDto<InspectionListItemDto>> => {
    useRuntimeConfig(event);

    const userId = await getRequiredUserId(event);

    const query = await getValidatedQuery(event, (raw) =>
      ListInspectionsQuerySchema.parse(raw),
    );

    const result = await listUserInspections(event, userId, query);

    return {
      data: result.items,
      meta: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
        pagination: {
          limit: result.limit,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      },
    };
  },
);
