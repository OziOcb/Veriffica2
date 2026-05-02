import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteCurrentUserResponseSchema } from "../../shared/contracts/delete-current-user";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockDeleteUser, mockAdminApi } = vi.hoisted(() => {
  const mockDeleteUser = vi.fn();
  const mockAdminApi = { deleteUser: mockDeleteUser };
  return { mockDeleteUser, mockAdminApi };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

vi.mock("#supabase/server", () => ({
  // serverSupabaseUser — returns a stub user with DEFAULT_USER_ID by default.
  serverSupabaseUser: vi.fn().mockResolvedValue({
    id: DEFAULT_USER_ID,
  }),
  // serverSupabaseServiceRole — synchronous; returns client with admin API.
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    auth: { admin: mockAdminApi },
  }),
}));

// ── Import mocks so we can control them per-test ───────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: meDeleteHandler } =
  await import("../../server/api/v1/me.delete");

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const VALID_BODY = { confirmation: "DELETE_MY_ACCOUNT" };

/**
 * Builds a minimal H3Event stub covering what the handler and its helpers
 * actually access:
 *  - `node.req.socket.remoteAddress` for rate-limit key derivation
 *  - `_readBody` / `_parsedBody` for `readValidatedBody`
 *  - `node.res` (headersSent / writableEnded) for cookie helpers
 *  - `context` for service-role client cache
 *
 * Each test gets a fresh object so cookie / rate-limit state does not leak.
 */
function makeEvent(body: unknown = VALID_BODY): H3Event {
  return {
    // H3 reads event.method first (before event.node.req.method).
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
    // Pre-fill _parsedBody so readValidatedBody skips streaming.
    _parsedBody: body,
    context: {},
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("DELETE /api/v1/me handler", () => {
  beforeEach(() => {
    // Reset call history between tests; mock implementations are re-established
    // via vi.hoisted / vi.mock so the factory defaults always apply.
    mockDeleteUser.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── Success ──────────────────────────────────────────────────────────────

  it("returns a valid DeleteCurrentUserResponse envelope on success", async () => {
    mockDeleteUser.mockResolvedValue({ error: null });

    const response = await meDeleteHandler(makeEvent());

    const parsed = DeleteCurrentUserResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.deleted).toBe(true);
      expect(parsed.data.data.signedOut).toBe(true);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  // ── 400 Bad Request ───────────────────────────────────────────────────────

  it("throws 400 when confirmation field is missing", async () => {
    await expect(meDeleteHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when confirmation has wrong value", async () => {
    await expect(
      meDeleteHandler(makeEvent({ confirmation: "yes-please-delete" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(meDeleteHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 409 Conflict ──────────────────────────────────────────────────────────

  it("throws 409 when Supabase Admin API rejects the delete", async () => {
    mockDeleteUser.mockResolvedValue({
      error: { message: "User not found", status: 404 },
    });

    await expect(meDeleteHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
