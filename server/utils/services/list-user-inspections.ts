import { serverSupabaseServiceRole } from "#supabase/server";
import { createError } from "h3";
import type { H3Event } from "h3";
import type { Json, Tables } from "~/db/database.types";
import type {
  InspectionListItemDto,
  InspectionProgressDto,
  InspectionScoreDistributionDto,
  InspectionAnswerValue,
  Cursor,
} from "~/types";
import type { ListInspectionsQuery } from "../../../shared/contracts/inspections";

type InspectionRow = Pick<
  Tables<"inspections">,
  | "id"
  | "title"
  | "status"
  | "snapshot_version"
  | "updated_at"
  | "created_at"
  | "completed_at"
  | "snapshot"
>;

/** Decoded form of the opaque pagination cursor. */
interface CursorPayload {
  sortValue: string;
  id: string;
}

/**
 * Subset of the snapshot JSONB that the list service needs to derive
 * progress, score distribution, and part1Complete.
 */
interface SnapshotListFields {
  part_1: Record<string, unknown> | null;
  answers: Record<string, string>;
  visible_question_ids: string[];
}

export interface ListUserInspectionsResult {
  items: InspectionListItemDto[];
  limit: number;
  nextCursor: Cursor | null;
  hasMore: boolean;
}

// ── Cursor encoding / decoding ─────────────────────────────────────────────

function encodeCursor(sortValue: string, id: string): string {
  const payload: CursorPayload = { sortValue, id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decodes an opaque cursor string into a sortValue + id pair.
 * Throws `400 Bad Request` if the cursor is malformed.
 */
function decodeCursor(cursor: string): CursorPayload {
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "The provided pagination cursor is invalid.",
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "The provided pagination cursor is invalid.",
    });
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as Record<string, unknown>)["sortValue"] !== "string" ||
    typeof (payload as Record<string, unknown>)["id"] !== "string"
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "Bad Request",
      message: "The provided pagination cursor is invalid.",
    });
  }

  return payload as CursorPayload;
}

// ── Snapshot helpers ───────────────────────────────────────────────────────

/**
 * Extracts only the list-relevant fields from the raw JSONB snapshot.
 * Returns safe defaults for any malformed or missing sub-fields so a single
 * corrupt snapshot cannot break the entire dashboard response.
 */
function extractSnapshotListFields(raw: Json): SnapshotListFields {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { part_1: null, answers: {}, visible_question_ids: [] };
  }

  const snap = raw as Record<string, Json | undefined>;

  const part1Raw = snap["part_1"];
  const part_1 =
    typeof part1Raw === "object" &&
    part1Raw !== null &&
    !Array.isArray(part1Raw)
      ? (part1Raw as Record<string, unknown>)
      : null;

  const answersRaw = snap["answers"];
  const answers: Record<string, string> =
    typeof answersRaw === "object" &&
    answersRaw !== null &&
    !Array.isArray(answersRaw)
      ? (answersRaw as Record<string, string>)
      : {};

  const vqidsRaw = snap["visible_question_ids"];
  const visible_question_ids: string[] = Array.isArray(vqidsRaw)
    ? vqidsRaw.filter((v): v is string => typeof v === "string")
    : [];

  return { part_1, answers, visible_question_ids };
}

// ── Derived field computation ──────────────────────────────────────────────

function computeProgress(
  answers: Record<string, string>,
  visibleQuestionIds: string[],
): InspectionProgressDto {
  const visibleQuestions = visibleQuestionIds.length;
  const answeredQuestions = visibleQuestionIds.filter(
    (id) => id in answers,
  ).length;
  const completionRate =
    visibleQuestions > 0
      ? Math.round((answeredQuestions / visibleQuestions) * 10000) / 100
      : 0;

  return { answeredQuestions, visibleQuestions, completionRate };
}

function computeScoreDistribution(
  answers: Record<string, string>,
  visibleQuestionIds: string[],
): InspectionScoreDistributionDto {
  let yes = 0;
  let no = 0;
  let dontKnow = 0;

  for (const qId of visibleQuestionIds) {
    const answer = answers[qId] as InspectionAnswerValue | undefined;
    if (answer === "yes") yes++;
    else if (answer === "no") no++;
    else if (answer === "dont_know") dontKnow++;
  }

  return { yes, no, dontKnow };
}

// ── Row mapping ────────────────────────────────────────────────────────────

function mapRowToListItem(row: InspectionRow): InspectionListItemDto {
  const { part_1, answers, visible_question_ids } = extractSnapshotListFields(
    row.snapshot,
  );

  const progress = computeProgress(answers, visible_question_ids);
  const scoreDistribution = computeScoreDistribution(
    answers,
    visible_question_ids,
  );

  return {
    id: row.id,
    title: row.title,
    status: row.status as InspectionListItemDto["status"],
    snapshotVersion: row.snapshot_version,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    progress,
    scoreDistribution,
    part1Complete: part_1 !== null,
    mode: row.status === "draft" ? "editable" : "report",
  };
}

// ── Sort column mapping ────────────────────────────────────────────────────

type SortColumn = "updated_at" | "created_at" | "title";
type SortDirection = "desc" | "asc";

function parseSortParam(sort: string): {
  column: SortColumn;
  direction: SortDirection;
} {
  if (sort === "created_at.desc")
    return { column: "created_at", direction: "desc" };
  if (sort === "title.asc") return { column: "title", direction: "asc" };
  return { column: "updated_at", direction: "desc" };
}

// ── Main service ───────────────────────────────────────────────────────────

/**
 * Lists the authenticated user's inspections with cursor-based pagination.
 *
 * NOTE: RLS is disabled on public.inspections (see migration
 * 20260501000100_disable_app_table_rls.sql), so the service-role client is
 * used and every query MUST include an explicit `.eq('user_id', userId)` filter
 * to prevent data from leaking across users.
 */
export async function listUserInspections(
  event: H3Event,
  userId: string,
  query: ListInspectionsQuery,
): Promise<ListUserInspectionsResult> {
  const client = serverSupabaseServiceRole(event);
  const { status, sort, limit, cursor } = query;
  const { column: sortColumn, direction } = parseSortParam(sort);

  // Fetch limit+1 rows to determine whether a next page exists without an
  // additional COUNT query.
  let dbQuery = client
    .from("inspections")
    .select(
      "id, title, status, snapshot_version, updated_at, created_at, completed_at, snapshot",
    )
    .eq("user_id", userId)
    .limit(limit + 1);

  if (status) {
    dbQuery = dbQuery.eq("status", status);
  }

  // Apply cursor filter before sorting so the query planner can use the index.
  if (cursor) {
    const { sortValue, id: cursorId } = decodeCursor(cursor);

    if (direction === "desc") {
      // Rows with an earlier sort value OR same sort value and earlier id.
      dbQuery = dbQuery.or(
        `${sortColumn}.lt.${sortValue},and(${sortColumn}.eq.${sortValue},id.lt.${cursorId})`,
      );
    } else {
      // Rows with a later sort value OR same sort value and later id.
      dbQuery = dbQuery.or(
        `${sortColumn}.gt.${sortValue},and(${sortColumn}.eq.${sortValue},id.gt.${cursorId})`,
      );
    }
  }

  // Apply primary sort + id tie-break to guarantee stable pagination.
  dbQuery = dbQuery
    .order(sortColumn, { ascending: direction === "asc" })
    .order("id", { ascending: direction === "asc" });

  const { data, error } = await dbQuery;

  if (error) {
    console.error("[list-user-inspections] inspections fetch failed", {
      endpoint: "GET /api/v1/inspections",
      errorType: "inspections-list-fetch",
      userId,
      error: error.message,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "Could not load inspections.",
    });
  }

  const rows = (data ?? []) as InspectionRow[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: Cursor | null = null;
  if (hasMore && pageRows.length > 0) {
    // pageRows.length > 0 is already checked in the `if` condition above;
    // non-null assertion is safe.
    const lastRow = pageRows[pageRows.length - 1]!;
    const sortValue = lastRow[sortColumn as keyof InspectionRow] as string;
    nextCursor = encodeCursor(sortValue, lastRow.id);
  }

  return {
    items: pageRows.map(mapRowToListItem),
    limit,
    nextCursor,
    hasMore,
  };
}
