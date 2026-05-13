import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReopenInspectionResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockRpc } = vi.hoisted(() => {
  const mockRpc = vi.fn();
  return { mockRpc };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

/**
 * The reopen service makes one Supabase call:
 *   client.rpc("reopen_inspection", {...})
 * The service-role client is used; ownership is enforced by the SQL function.
 */
vi.mock("#supabase/server", () => ({
  serverSupabaseUser: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }),
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    rpc: mockRpc,
  }),
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: reopenPostHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/reopen.post");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const STUB_SNAPSHOT_VERSION = 8;

const VALID_BODY = {
  confirmation: "REOPEN_INSPECTION",
  baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
} as const;

/** RPC success row returned by public.reopen_inspection. */
function makeRpcRows(version = STUB_SNAPSHOT_VERSION + 1) {
  return [{ snapshot_version: version }];
}

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(
  inspectionId: string = STUB_INSPECTION_ID,
  body: unknown = VALID_BODY,
): H3Event {
  return {
    method: "POST",
    path: `/api/v1/inspections/${inspectionId}/reopen`,
    node: {
      req: {
        method: "POST",
        url: `/api/v1/inspections/${inspectionId}/reopen`,
        socket: { remoteAddress: "127.0.0.1" },
        headers: { origin: "http://localhost:3000" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
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
    headers: new Headers([["origin", "http://localhost:3000"]]),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/v1/inspections/:inspectionId/reopen handler", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — success ──────────────────────────────────────────────────

  it("returns a valid ReopenInspectionResponse envelope on success", async () => {
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const response = await reopenPostHandler(makeEvent());

    const parsed = ReopenInspectionResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
  });

  it("returns status=draft, completedAt=null and mode=editable on success", async () => {
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const response = await reopenPostHandler(makeEvent());
    const data = (response as { data: Record<string, unknown> }).data;

    expect(data.inspectionId).toBe(STUB_INSPECTION_ID);
    expect(data.status).toBe("draft");
    expect(data.completedAt).toBeNull();
    expect(data.mode).toBe("editable");
    expect(data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION + 1);
  });

  it("calls the RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    await reopenPostHandler(makeEvent());

    expect(mockRpc).toHaveBeenCalledWith("reopen_inspection", {
      p_user_id: STUB_USER_ID,
      p_inspection_id: STUB_INSPECTION_ID,
      p_base_snapshot_version: STUB_SNAPSHOT_VERSION,
    });
  });

  // ── 400 Bad Request — body validation ─────────────────────────────────

  it("throws 400 when body is missing", async () => {
    await expect(
      reopenPostHandler(makeEvent(STUB_INSPECTION_ID, null)),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when confirmation field is wrong literal", async () => {
    await expect(
      reopenPostHandler(
        makeEvent(STUB_INSPECTION_ID, {
          confirmation: "YES_REOPEN",
          baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when baseSnapshotVersion is missing", async () => {
    await expect(
      reopenPostHandler(
        makeEvent(STUB_INSPECTION_ID, { confirmation: "REOPEN_INSPECTION" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body contains extra unknown keys (strict object)", async () => {
    await expect(
      reopenPostHandler(
        makeEvent(STUB_INSPECTION_ID, {
          ...VALID_BODY,
          extra: "injected",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 400 Bad Request — route param ─────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      reopenPostHandler(makeEvent("not-a-uuid")),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(reopenPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "NOT_FOUND", hint: "NOT_FOUND", code: "P0003" },
    });

    await expect(reopenPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // ── 409 Conflict — snapshot version ───────────────────────────────────

  it("throws 409 when baseSnapshotVersion is stale", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "SNAPSHOT_CONFLICT",
        hint: "SNAPSHOT_CONFLICT",
        code: "P0004",
      },
    });

    await expect(reopenPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  // ── 409 Conflict — invalid state ──────────────────────────────────────

  it("throws 409 when inspection is not completed (INVALID_STATE)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "INVALID_STATE",
        hint: "Only completed inspections can be reopened.",
        code: "P0005",
      },
    });

    await expect(reopenPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
