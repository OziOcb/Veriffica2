import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetCurrentUserPreferencesResponseSchema } from "../../shared/contracts/current-user-preferences";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockSingle, mockChain } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSingle,
  };
  return { mockSingle, mockChain };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

vi.mock("#supabase/server", () => ({
  // serverSupabaseUser — used by getRequiredUserId to resolve the session.
  serverSupabaseUser: vi.fn().mockResolvedValue({
    id: DEFAULT_USER_ID,
  }),
  // serverSupabaseClient — used by getCurrentUserPreferences to query the DB.
  serverSupabaseClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue(mockChain),
  }),
}));

// ── Import mocks so we can control them per-test ───────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: mePreferencesGetHandler } =
  await import("../../server/api/v1/me/preferences.get");

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;

const STUB_PREFERENCES_ROW = {
  user_id: STUB_USER_ID,
  theme: "system",
  font_scale: "medium",
  hide_inspection_intro: false,
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-05-01T12:00:00.000Z",
};

// Minimal H3 event stub — provides just enough for getRequestHeader (used by
// getRequiredUserId) and serverSupabaseUser / serverSupabaseClient mocks.
function makeEvent(): H3Event {
  return {
    node: {
      req: { headers: {} },
      res: {},
    },
    context: {},
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/v1/me/preferences handler", () => {
  beforeEach(() => {
    mockSingle.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it("returns a valid GetCurrentUserPreferencesResponse envelope on success", async () => {
    mockSingle.mockResolvedValue({ data: STUB_PREFERENCES_ROW, error: null });

    const response = await mePreferencesGetHandler(makeEvent());

    // Validate full response shape against the Zod contract.
    const parsed = GetCurrentUserPreferencesResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.userId).toBe(STUB_USER_ID);
      expect(parsed.data.data.theme).toBe("system");
      expect(parsed.data.data.fontScale).toBe("medium");
      expect(parsed.data.data.hideInspectionIntro).toBe(false);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(mePreferencesGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────────

  it("throws 500 when the user_preferences row is missing (data invariant violation)", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "Row not found" },
    });

    await expect(mePreferencesGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("throws 500 when Supabase returns a DB error", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "connection timeout" },
    });

    await expect(mePreferencesGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
