import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state so it's available inside vi.mock factories ─────

const { mockSingle, mockChain } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSingle,
  };
  return { mockSingle, mockChain };
});

// Mock #supabase/server before the module under test is loaded.
vi.mock("#supabase/server", () => ({
  serverSupabaseClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue(mockChain),
  }),
}));

// Import the module under test AFTER mocks are established.
const { getCurrentUserAccount } =
  await import("../../server/utils/services/get-current-user-account");

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;

const STUB_PROFILE_ROW = {
  user_id: STUB_USER_ID,
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-05-01T12:00:00.000Z",
};

// Minimal H3 event stub — the service only passes it to serverSupabaseClient.
const fakeEvent = {} as Parameters<typeof getCurrentUserAccount>[0];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("getCurrentUserAccount service", () => {
  beforeEach(() => {
    // Only reset call history; the chain mock setup is stable via vi.hoisted.
    mockSingle.mockReset();
    mockChain.select.mockReturnThis();
    mockChain.eq.mockReturnThis();
  });

  it("returns a CurrentUserAccountDto when profiles row exists", async () => {
    mockSingle.mockResolvedValue({ data: STUB_PROFILE_ROW, error: null });

    const result = await getCurrentUserAccount(fakeEvent);

    expect(result.profile).toEqual({
      userId: STUB_PROFILE_ROW.user_id,
      createdAt: STUB_PROFILE_ROW.created_at,
      updatedAt: STUB_PROFILE_ROW.updated_at,
    });
    expect(result.user.id).toBe(STUB_USER_ID);
  });

  it("throws 500 when profiles row is missing", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "Row not found" },
    });

    await expect(getCurrentUserAccount(fakeEvent)).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
