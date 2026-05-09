import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteInspectionResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockMaybeSingle, mockDelete } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  const mockDelete = vi.fn();
  return { mockMaybeSingle, mockDelete };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

/**
 * The delete service makes two consecutive `from("inspections")` calls:
 *   1. .select("id").eq(...).eq(...).maybeSingle()  — ownership check
 *   2. .delete().eq(...).eq(...)                     — hard delete
 *
 * We distinguish them by inspecting which builder method is called first.
 */
vi.mock("#supabase/server", () => ({
  serverSupabaseUser: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }),
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      // select chain → ends with maybeSingle
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
      }),
      // delete chain → ends directly (delete returns a promise-like)
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        then: mockDelete,
      }),
    }),
  }),
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: inspectionDeleteHandler } =
  await import("../../server/api/v1/inspections/[inspectionId].delete");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VALID_BODY = { confirmation: "DELETE_INSPECTION" } as const;

// ── Event factory ──────────────────────────────────────────────────────────

/**
 * Builds a minimal H3Event stub for DELETE /api/v1/inspections/:inspectionId.
 *
 * - Router params in context.params for getValidatedRouterParams.
 * - _parsedBody pre-filled so readValidatedBody skips streaming.
 * - Fixed IP so the suite exercises repeated same-IP calls without any
 *   rate-limit workaround.
 * - node.res stubs for H3 response helpers.
 */
function makeEvent(
  inspectionId: string = STUB_INSPECTION_ID,
  body: unknown = VALID_BODY,
): H3Event {
  return {
    method: "DELETE",
    node: {
      req: {
        method: "DELETE",
        socket: { remoteAddress: "127.0.0.1" },
        headers: {},
        body: JSON.stringify(body),
      },
      res: {
        headersSent: false,
        writableEnded: false,
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      },
    },
    _parsedBody: body,
    context: {
      params: { inspectionId },
    },
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Helper: wire up a successful delete flow ───────────────────────────────

function setupSuccessfulDelete() {
  // Ownership check returns the row.
  mockMaybeSingle.mockResolvedValue({
    data: { id: STUB_INSPECTION_ID },
    error: null,
  });
  // delete().eq().eq() resolves with no error.
  // The delete chain uses .then() directly in the mock because Supabase
  // builders are promise-like; we forward the resolution via mockDelete.
  mockDelete.mockImplementation((resolve: (v: unknown) => void) =>
    resolve({ error: null }),
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("DELETE /api/v1/inspections/:inspectionId handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockDelete.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── Success — 200 OK ──────────────────────────────────────────────────────

  it("returns a valid DeleteInspectionResponse envelope on success", async () => {
    setupSuccessfulDelete();

    const response = await inspectionDeleteHandler(makeEvent());

    const parsed = DeleteInspectionResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.deleted).toBe(true);
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.freedSlots).toBe(1);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    // Ownership check returns no row.
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(inspectionDeleteHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // ── 400 Bad Request — body validation ────────────────────────────────────

  it("throws 400 when confirmation field is missing", async () => {
    await expect(
      inspectionDeleteHandler(makeEvent(STUB_INSPECTION_ID, {})),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when confirmation has wrong literal value", async () => {
    await expect(
      inspectionDeleteHandler(
        makeEvent(STUB_INSPECTION_ID, { confirmation: "yes-delete" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body contains extra unknown keys (strict object)", async () => {
    await expect(
      inspectionDeleteHandler(
        makeEvent(STUB_INSPECTION_ID, {
          confirmation: "DELETE_INSPECTION",
          extra: "field",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 400 Bad Request — route param validation ──────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      inspectionDeleteHandler(makeEvent("not-a-uuid")),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(inspectionDeleteHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
