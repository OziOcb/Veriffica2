import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchCurrentUserPreferencesResponseSchema } from "../../shared/contracts/current-user-preferences";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockSingle, mockChain, mockFrom } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockChain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: mockSingle,
  };
  const mockFrom = vi.fn().mockReturnValue(mockChain);

  return { mockSingle, mockChain, mockFrom };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: vi.fn().mockResolvedValue({
    id: DEFAULT_USER_ID,
  }),
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    from: mockFrom,
  }),
}));

// ── Import mocks so we can control them per-test ───────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ─────────────────────────────

const { default: mePreferencesPatchHandler } =
  await import("../../server/api/v1/me/preferences.patch");

// ── Helpers ────────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;

const FULL_PATCH_BODY = {
  theme: "dark",
  fontScale: "large",
  hideInspectionIntro: true,
};

const UPDATED_PREFERENCES_ROW = {
  user_id: STUB_USER_ID,
  theme: "dark",
  font_scale: "large",
  hide_inspection_intro: true,
  updated_at: "2026-05-08T12:00:00.000Z",
};

function makeEvent(body: unknown = FULL_PATCH_BODY): H3Event {
  return {
    method: "PATCH",
    node: {
      req: {
        method: "PATCH",
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
    context: {},
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PATCH /api/v1/me/preferences handler", () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockFrom.mockClear();
    mockChain.update.mockClear();
    mockChain.eq.mockClear();
    mockChain.select.mockClear();

    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  it("returns a valid PatchCurrentUserPreferencesResponse envelope on full patch success", async () => {
    mockSingle.mockResolvedValue({
      data: UPDATED_PREFERENCES_ROW,
      error: null,
    });

    const response = await mePreferencesPatchHandler(makeEvent());

    const parsed =
      PatchCurrentUserPreferencesResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.userId).toBe(STUB_USER_ID);
      expect(parsed.data.data.theme).toBe("dark");
      expect(parsed.data.data.fontScale).toBe("large");
      expect(parsed.data.data.hideInspectionIntro).toBe(true);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("returns 200 for a partial patch with a single mutable field", async () => {
    mockSingle.mockResolvedValue({
      data: {
        user_id: STUB_USER_ID,
        theme: "system",
        font_scale: "medium",
        hide_inspection_intro: true,
        updated_at: "2026-05-08T12:05:00.000Z",
      },
      error: null,
    });

    const response = await mePreferencesPatchHandler(
      makeEvent({ hideInspectionIntro: true }),
    );

    const parsed =
      PatchCurrentUserPreferencesResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.theme).toBe("system");
      expect(parsed.data.data.fontScale).toBe("medium");
      expect(parsed.data.data.hideInspectionIntro).toBe(true);
    }
  });

  it("throws 400 when the patch payload is empty", async () => {
    await expect(
      mePreferencesPatchHandler(makeEvent({})),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when theme is outside the allowed enum", async () => {
    await expect(
      mePreferencesPatchHandler(makeEvent({ theme: "sepia" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when the payload contains an unknown field", async () => {
    await expect(
      mePreferencesPatchHandler(makeEvent({ theme: "dark", locale: "pl-PL" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(mePreferencesPatchHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("throws 500 when Supabase returns a database error during update", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "connection timeout" },
    });

    await expect(mePreferencesPatchHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
