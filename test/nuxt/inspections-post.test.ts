import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateInspectionResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockRpc } = vi.hoisted(() => {
  const mockRpc = vi.fn();
  return { mockRpc };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

vi.mock("#supabase/server", () => ({
  // serverSupabaseUser — used by getRequiredUserId to resolve the session.
  serverSupabaseUser: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }),
  // serverSupabaseServiceRole — synchronous; used by createInspection.
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    rpc: mockRpc,
  }),
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: inspectionsPostHandler } =
  await import("../../server/api/v1/inspections/index.post");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const VALID_BODY = { clientCreatedAt: "2026-05-01T12:00:00Z" };

/** Row shape returned by public.create_inspection RPC (RETURNS TABLE). */
const STUB_RPC_ROW = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "Untitled inspection",
  status: "draft",
  question_bank_version: "2026-05-01",
  snapshot_schema_version: "1.0.0",
  snapshot_version: 1,
  client_updated_at: "2026-05-01T12:00:00.000Z",
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-05-01T12:00:00.000Z",
  snapshot: {
    part_1: null,
    runtime_flags: {
      chargingPortEquipped: false,
      evBatteryDocsAvailable: false,
      turboEquipped: false,
      mechanicalCompressorEquipped: false,
      importedFromEU: false,
    },
    answers: {},
    question_notes: {},
    global_notes: "",
    visible_group_ids: [],
    visible_question_ids: [],
  },
  current_count: 1,
};

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(body: unknown = VALID_BODY): H3Event {
  return {
    method: "POST",
    node: {
      req: {
        method: "POST",
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

describe("POST /api/v1/inspections handler", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── Success — 201 Created ─────────────────────────────────────────────────

  it("returns a valid CreateInspectionResponse envelope on success", async () => {
    mockRpc.mockResolvedValue({ data: [STUB_RPC_ROW], error: null });

    const response = await inspectionsPostHandler(makeEvent());

    const parsed = CreateInspectionResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      const { inspection, limits } = parsed.data.data;

      expect(inspection.id).toBe(STUB_RPC_ROW.id);
      expect(inspection.title).toBe("Untitled inspection");
      expect(inspection.status).toBe("draft");
      expect(inspection.part1).toBeNull();
      expect(inspection.mode).toBe("editable");
      expect(inspection.snapshotVersion).toBe(1);
      expect(inspection.runtimeFlags.turboEquipped).toBe(false);
      expect(inspection.answers).toEqual({});
      expect(inspection.questionNotes).toEqual({});
      expect(inspection.globalNotes).toBe("");
      expect(inspection.visibleGroupIds).toEqual([]);
      expect(inspection.visibleQuestionIds).toEqual([]);
      expect(inspection.progress.answeredQuestions).toBe(0);
      expect(inspection.progress.visibleQuestions).toBe(0);
      expect(inspection.scoreDistribution.yes).toBe(0);

      expect(limits.maxInspections).toBe(2);
      expect(limits.currentInspections).toBe(1);
      expect(limits.remaining).toBe(1);

      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("returns correct limits when user has 2 inspections after creation", async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...STUB_RPC_ROW, current_count: 2 }],
      error: null,
    });

    const response = await inspectionsPostHandler(makeEvent());

    const parsed = CreateInspectionResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const { limits } = parsed.data.data;
      expect(limits.currentInspections).toBe(2);
      expect(limits.remaining).toBe(0);
    }
  });

  // ── 409 Conflict — limit reached ─────────────────────────────────────────

  it("throws 409 with INSPECTION_LIMIT_REACHED when limit is exceeded", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "INSPECTION_LIMIT_REACHED", hint: "" },
    });

    await expect(inspectionsPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
      data: expect.objectContaining({
        error: expect.objectContaining({ code: "INSPECTION_LIMIT_REACHED" }),
      }),
    });
  });

  it("throws 409 when error hint contains INSPECTION_LIMIT_REACHED", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "P0001",
        hint: "INSPECTION_LIMIT_REACHED",
      },
    });

    await expect(inspectionsPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  // ── 422 Unprocessable Entity — invalid body ───────────────────────────────

  it("throws 400 when clientCreatedAt is missing", async () => {
    await expect(inspectionsPostHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws 400 when clientCreatedAt is not a valid ISO 8601 datetime", async () => {
    await expect(
      inspectionsPostHandler(makeEvent({ clientCreatedAt: "not-a-date" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when extra unknown fields are included in body", async () => {
    await expect(
      inspectionsPostHandler(
        makeEvent({ clientCreatedAt: "2026-05-01T12:00:00Z", extra: "field" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(inspectionsPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────────

  it("throws 500 when the RPC fails with an unexpected error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection timeout", hint: "" },
    });

    await expect(inspectionsPostHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
