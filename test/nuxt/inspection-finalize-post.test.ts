import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinalizeInspectionResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockRpc } = vi.hoisted(() => {
  const mockRpc = vi.fn();
  return { mockRpc };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

/**
 * The finalize service makes one Supabase call:
 *   client.rpc("finalize_inspection", {...})
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

const { default: finalizePostHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/finalize.post");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STUB_SNAPSHOT_VERSION = 5;
const STUB_COMPLETED_AT = "2026-05-13T12:00:00.000Z";

const VALID_BODY = {
  confirmation: "FINALIZE_INSPECTION",
  baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
} as const;

/** RPC success row returned by public.finalize_inspection. */
function makeRpcRows(
  version = STUB_SNAPSHOT_VERSION + 1,
  completedAt = STUB_COMPLETED_AT,
) {
  return [{ snapshot_version: version, completed_at: completedAt }];
}

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(
  inspectionId: string = STUB_INSPECTION_ID,
  body: unknown = VALID_BODY,
): H3Event {
  return {
    method: "POST",
    path: `/api/v1/inspections/${inspectionId}/finalize`,
    node: {
      req: {
        method: "POST",
        url: `/api/v1/inspections/${inspectionId}/finalize`,
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

describe("POST /api/v1/inspections/:inspectionId/finalize handler", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — success ──────────────────────────────────────────────────

  it("returns a valid FinalizeInspectionResponse envelope on success", async () => {
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const response = await finalizePostHandler(makeEvent());

    const parsed = FinalizeInspectionResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
  });

  it("returns status=completed, mode=report and correct snapshotVersion", async () => {
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const response = await finalizePostHandler(makeEvent());
    const data = (response as { data: Record<string, unknown> }).data;

    expect(data.inspectionId).toBe(STUB_INSPECTION_ID);
    expect(data.status).toBe("completed");
    expect(data.mode).toBe("report");
    expect(data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION + 1);
    expect(typeof data.completedAt).toBe("string");
  });

  it("calls the RPC with correct parameters", async () => {
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    await finalizePostHandler(makeEvent());

    expect(mockRpc).toHaveBeenCalledWith("finalize_inspection", {
      p_user_id: STUB_USER_ID,
      p_inspection_id: STUB_INSPECTION_ID,
      p_base_snapshot_version: STUB_SNAPSHOT_VERSION,
    });
  });

  // ── 400 Bad Request — body validation ─────────────────────────────────

  it("throws 400 when body is missing", async () => {
    await expect(
      finalizePostHandler(makeEvent(STUB_INSPECTION_ID, null)),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when confirmation field is wrong literal", async () => {
    await expect(
      finalizePostHandler(
        makeEvent(STUB_INSPECTION_ID, {
          confirmation: "YES_FINALIZE",
          baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when baseSnapshotVersion is missing", async () => {
    await expect(
      finalizePostHandler(
        makeEvent(STUB_INSPECTION_ID, { confirmation: "FINALIZE_INSPECTION" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body contains extra unknown keys (strict object)", async () => {
    await expect(
      finalizePostHandler(
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
      finalizePostHandler(makeEvent("not-a-uuid")),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(finalizePostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "NOT_FOUND", hint: "NOT_FOUND", code: "P0003" },
    });

    await expect(finalizePostHandler(makeEvent())).rejects.toMatchObject({
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

    await expect(finalizePostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  // ── 422 Unprocessable Entity — invalid state ───────────────────────────

  it("throws 422 when inspection is already completed (INVALID_STATE)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "INVALID_STATE",
        hint: "Only draft inspections can be finalized.",
        code: "P0005",
      },
    });

    await expect(finalizePostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 422,
    });
  });
});
