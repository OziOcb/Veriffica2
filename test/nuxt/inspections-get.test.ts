import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListInspectionsResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockSelect, mockServiceChain } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockServiceChain = {
    select: mockSelect,
  };
  return { mockSelect, mockServiceChain };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

vi.mock("#supabase/server", () => ({
  // serverSupabaseUser — used by getRequiredUserId to resolve the session.
  serverSupabaseUser: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }),
  // serverSupabaseServiceRole — synchronous; used by listUserInspections.
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue(mockServiceChain),
  }),
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: inspectionsGetHandler } =
  await import("../../server/api/v1/inspections/index.get");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;

/**
 * Minimal inspection DB row with an empty snapshot that produces zero-valued
 * progress and score distribution.
 */
const STUB_INSPECTION_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Toyota Corolla 2016 ABC123",
  status: "draft",
  snapshot_version: 4,
  updated_at: "2026-05-01T12:00:00.000Z",
  created_at: "2026-05-01T11:00:00.000Z",
  completed_at: null,
  snapshot: {
    part_1: { make: "Toyota", model: "Corolla" },
    answers: { q_brakes: "yes", q_body: "no" },
    visible_question_ids: ["q_brakes", "q_body", "q_lights"],
    runtime_flags: {},
    question_notes: {},
    global_notes: "",
    visible_group_ids: [],
  },
};

const STUB_EMPTY_SNAPSHOT_ROW = {
  ...STUB_INSPECTION_ROW,
  id: "22222222-2222-4222-8222-222222222222",
  snapshot: {
    part_1: null,
    answers: {},
    visible_question_ids: [],
    runtime_flags: {},
    question_notes: {},
    global_notes: "",
    visible_group_ids: [],
  },
};

// ── Supabase query chain builder ───────────────────────────────────────────

/**
 * Builds a mock Supabase query chain that always resolves with the given rows.
 * Each call to a chainable method returns the same chainable object.
 */
function makeQueryChain(rows: unknown[], error: unknown = null) {
  const terminal = vi.fn().mockResolvedValue({ data: rows, error });
  // orderCallCount lives outside the Proxy getter so all `.order()` calls
  // (regardless of which getter invocation returned the fn) share the counter.
  let orderCallCount = 0;
  const chainable = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "order") {
        // Second `.order()` call (id tie-break) resolves the promise.
        return vi.fn().mockImplementation(() => {
          orderCallCount++;
          if (orderCallCount >= 2) return terminal();
          return chainable;
        });
      }
      return vi.fn().mockReturnValue(chainable);
    },
  });
  return { chain: chainable, terminal };
}

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(query: Record<string, string> = {}): H3Event {
  const searchParams = new URLSearchParams(query);
  const qs = searchParams.toString();
  // h3 v1's getQuery reads from event.path (not event.node.req.url).
  const path = `/api/v1/inspections${qs ? "?" + qs : ""}`;
  return {
    method: "GET",
    path,
    node: {
      req: {
        method: "GET",
        socket: { remoteAddress: "127.0.0.1" },
        headers: {},
        url: path,
      },
      res: {},
    },
    context: {},
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/v1/inspections handler", () => {
  beforeEach(() => {
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── Success — empty list ──────────────────────────────────────────────────

  it("returns a valid ListInspectionsResponse with an empty list", async () => {
    const { chain } = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);

    const response = await inspectionsGetHandler(makeEvent());

    const parsed = ListInspectionsResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data).toHaveLength(0);
      expect(parsed.data.meta.pagination.hasMore).toBe(false);
      expect(parsed.data.meta.pagination.nextCursor).toBeNull();
      expect(typeof parsed.data.meta.requestId).toBe("string");
    }
  });

  // ── Success — list with items ─────────────────────────────────────────────

  it("returns a list with correctly mapped items", async () => {
    const { chain } = makeQueryChain([STUB_INSPECTION_ROW]);
    mockSelect.mockReturnValue(chain);

    const response = await inspectionsGetHandler(makeEvent());

    const parsed = ListInspectionsResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data).toHaveLength(1);
      const item = parsed.data.data[0]!;
      expect(item.id).toBe(STUB_INSPECTION_ROW.id);
      expect(item.title).toBe(STUB_INSPECTION_ROW.title);
      expect(item.status).toBe("draft");
      expect(item.mode).toBe("editable");
      expect(item.part1Complete).toBe(true);
    }
  });

  // ── Success — derived progress and score distribution ─────────────────────

  it("derives progress and scoreDistribution from snapshot", async () => {
    const { chain } = makeQueryChain([STUB_INSPECTION_ROW]);
    mockSelect.mockReturnValue(chain);

    const response = await inspectionsGetHandler(makeEvent());

    const parsed = ListInspectionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const item = parsed.data.data[0]!;
      // 3 visible questions, 2 answered (q_brakes, q_body)
      expect(item.progress.visibleQuestions).toBe(3);
      expect(item.progress.answeredQuestions).toBe(2);
      // scoreDistribution: yes=1, no=1, dontKnow=0
      expect(item.scoreDistribution.yes).toBe(1);
      expect(item.scoreDistribution.no).toBe(1);
      expect(item.scoreDistribution.dontKnow).toBe(0);
    }
  });

  // ── Success — part1Complete false when snapshot part_1 is null ───────────

  it("sets part1Complete to false when part_1 is null", async () => {
    const { chain } = makeQueryChain([STUB_EMPTY_SNAPSHOT_ROW]);
    mockSelect.mockReturnValue(chain);

    const response = await inspectionsGetHandler(makeEvent());

    const parsed = ListInspectionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data[0]!.part1Complete).toBe(false);
    }
  });

  // ── Pagination — hasMore and nextCursor ───────────────────────────────────

  it("sets hasMore and nextCursor when more rows exist (limit=1)", async () => {
    // Return limit+1 rows so hasMore is true.
    const { chain } = makeQueryChain([
      STUB_INSPECTION_ROW,
      STUB_EMPTY_SNAPSHOT_ROW,
    ]);
    mockSelect.mockReturnValue(chain);

    const response = await inspectionsGetHandler(makeEvent({ limit: "1" }));

    const parsed = ListInspectionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data).toHaveLength(1);
      expect(parsed.data.meta.pagination.hasMore).toBe(true);
      expect(typeof parsed.data.meta.pagination.nextCursor).toBe("string");
    }
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(inspectionsGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 400 Bad Request — invalid query params ────────────────────────────────

  it("throws 400 when status has an invalid value", async () => {
    await expect(
      inspectionsGetHandler(makeEvent({ status: "unknown" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when sort has an invalid value", async () => {
    await expect(
      inspectionsGetHandler(makeEvent({ sort: "price.asc" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when limit exceeds maximum", async () => {
    await expect(
      inspectionsGetHandler(makeEvent({ limit: "100" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when limit is zero", async () => {
    await expect(
      inspectionsGetHandler(makeEvent({ limit: "0" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when cursor is malformed", async () => {
    const { chain } = makeQueryChain([]);
    mockSelect.mockReturnValue(chain);

    await expect(
      inspectionsGetHandler(makeEvent({ cursor: "!!!not-base64!!!" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────────

  it("throws 500 when the DB query fails", async () => {
    const { chain } = makeQueryChain([], { message: "connection reset" });
    mockSelect.mockReturnValue(chain);

    await expect(inspectionsGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
