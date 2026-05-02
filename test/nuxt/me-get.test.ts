import { describe, expect, it, vi } from "vitest";
import { GetCurrentUserResponseSchema } from "../../shared/contracts/current-user";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Mock #supabase/server so the service returns controlled data ───────────

const { mockSingle, mockChain } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSingle,
  };
  return { mockSingle, mockChain };
});

vi.mock("#supabase/server", () => ({
  serverSupabaseClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue(mockChain),
  }),
}));

// Import the handler after mocks are set up.
const { default: meGetHandler } = await import("../../server/api/v1/me.get");

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;

const STUB_PROFILE_ROW = {
  user_id: STUB_USER_ID,
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-05-01T12:00:00.000Z",
};

// Minimal H3 event stub — the handler only passes it to the service.
const fakeEvent = {} as H3Event;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/v1/me handler", () => {
  it("returns a valid GetCurrentUserResponse envelope on success", async () => {
    mockSingle.mockResolvedValue({ data: STUB_PROFILE_ROW, error: null });

    const response = await meGetHandler(fakeEvent);

    // Validate full response shape against the Zod contract.
    const parsed = GetCurrentUserResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.user.id).toBe(STUB_USER_ID);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("propagates a 500 error when the profiles row is missing", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "Row not found" },
    });

    await expect(meGetHandler(fakeEvent)).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
