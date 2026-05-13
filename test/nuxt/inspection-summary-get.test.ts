import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetInspectionSummaryResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockMaybeSingle } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  return { mockMaybeSingle };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

/**
 * The summary service makes one Supabase call:
 *   from("inspections").select(...).eq("id", ...).eq("user_id", ...).maybeSingle()
 */
vi.mock("#supabase/server", () => ({
  serverSupabaseUser: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }),
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        maybeSingle: mockMaybeSingle,
      }),
    }),
  }),
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: summaryGetHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/summary.get");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STUB_SNAPSHOT_VERSION = 7;

const STUB_SNAPSHOT = {
  part_1: { make: "Toyota", model: "Corolla", notes: "" },
  runtime_flags: {
    chargingPortEquipped: false,
    evBatteryDocsAvailable: false,
    turboEquipped: false,
    mechanicalCompressorEquipped: false,
    importedFromEU: false,
  },
  answers: {
    q_p2_base_car_body_corrosion_bonnet: "yes",
    q_p2_base_car_body_corrosion_roof: "no",
  },
  question_notes: {
    q_p2_base_car_body_corrosion_bonnet: "Minor scratch visible.",
  },
  global_notes: "Overall good condition.",
  visible_group_ids: ["g_p2_base_car_body_corrosion"],
  visible_question_ids: [
    "q_p2_base_car_body_corrosion_bonnet",
    "q_p2_base_car_body_corrosion_roof",
  ],
};

/** Draft inspection row. */
const STUB_DRAFT_ROW = {
  id: STUB_INSPECTION_ID,
  title: "Toyota Corolla 2020",
  status: "draft",
  snapshot: STUB_SNAPSHOT,
  snapshot_version: STUB_SNAPSHOT_VERSION,
  completed_at: null,
  question_bank_version: "2026-05-12",
};

/** Completed inspection row (same data, different status). */
const STUB_COMPLETED_ROW = {
  ...STUB_DRAFT_ROW,
  status: "completed",
  completed_at: "2026-05-13T10:00:00Z",
};

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(options: {
  inspectionId?: string;
  query?: Record<string, string>;
}): H3Event {
  const { inspectionId = STUB_INSPECTION_ID, query = {} } = options;

  const queryString = new URLSearchParams(query).toString();
  const path = `/api/v1/inspections/${inspectionId}/summary${queryString ? `?${queryString}` : ""}`;

  return {
    method: "GET",
    path,
    node: {
      req: {
        method: "GET",
        url: path,
        socket: { remoteAddress: "127.0.0.1" },
        headers: {},
      },
      res: {
        headersSent: false,
        writableEnded: false,
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      },
    },
    _parsedBody: undefined,
    context: {
      params: { inspectionId },
    },
    // Simulate the parsed query string
    _query: query,
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/v1/inspections/:inspectionId/summary handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — base response (no include) ───────────────────────────────

  it("returns a valid GetInspectionSummaryResponse envelope on success", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(makeEvent({}));

    const parsed = GetInspectionSummaryResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);
  });

  it("returns correct inspectionId, title, status and mode for a draft inspection", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(makeEvent({}));
    const data = (response as { data: Record<string, unknown> }).data;

    expect(data.inspectionId).toBe(STUB_INSPECTION_ID);
    expect(data.title).toBe("Toyota Corolla 2020");
    expect(data.status).toBe("draft");
    expect(data.mode).toBe("editable");
  });

  it("returns mode=report for a completed inspection", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_COMPLETED_ROW,
      error: null,
    });

    const response = await summaryGetHandler(makeEvent({}));
    const data = (response as { data: Record<string, unknown> }).data;

    expect(data.status).toBe("completed");
    expect(data.mode).toBe("report");
  });

  it("returns correct totalScoreDistribution based on snapshot answers", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(makeEvent({}));
    const data = (
      response as {
        data: {
          totalScoreDistribution: { yes: number; no: number; dontKnow: number };
        };
      }
    ).data;

    // 1 yes + 1 no out of 2 visible questions
    expect(data.totalScoreDistribution.yes).toBe(1);
    expect(data.totalScoreDistribution.no).toBe(1);
    expect(data.totalScoreDistribution.dontKnow).toBe(0);
  });

  it("returns correct progress (2 answered out of 2 visible)", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(makeEvent({}));
    const data = (
      response as {
        data: {
          progress: { answeredQuestions: number; visibleQuestions: number };
        };
      }
    ).data;

    expect(data.progress.answeredQuestions).toBe(2);
    expect(data.progress.visibleQuestions).toBe(2);
  });

  it("omits questions[] when include is not specified", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(makeEvent({}));
    const data = (response as { data: Record<string, unknown> }).data;

    expect(data.questions).toBeUndefined();
  });

  // ── 200 OK — include=questions ────────────────────────────────────────

  it("includes questions[] when include=questions is requested", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(
      makeEvent({ query: { include: "questions" } }),
    );
    const data = (response as { data: Record<string, unknown> }).data;

    expect(Array.isArray(data.questions)).toBe(true);
  });

  it("questions[] contains only answered questions", async () => {
    // 2 visible, 2 answered → 2 rows
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(
      makeEvent({ query: { include: "questions" } }),
    );
    const questions = (response as { data: { questions: unknown[] } }).data
      .questions;

    expect(questions.length).toBe(2);
  });

  it("questions[].editable is true for draft inspections", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(
      makeEvent({ query: { include: "questions" } }),
    );
    const questions = (
      response as { data: { questions: Array<{ editable: boolean }> } }
    ).data.questions;

    expect(questions.every((q) => q.editable === true)).toBe(true);
  });

  it("questions[].editable is false for completed inspections", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_COMPLETED_ROW,
      error: null,
    });

    const response = await summaryGetHandler(
      makeEvent({ query: { include: "questions" } }),
    );
    const questions = (
      response as { data: { questions: Array<{ editable: boolean }> } }
    ).data.questions;

    expect(questions.every((q) => q.editable === false)).toBe(true);
  });

  it("omits questionNote when include=questions but not include=notes", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(
      makeEvent({ query: { include: "questions" } }),
    );
    const questions = (
      response as { data: { questions: Array<Record<string, unknown>> } }
    ).data.questions;

    expect(questions.every((q) => q.questionNote === undefined)).toBe(true);
  });

  it("includes questionNote when include=questions,notes is requested", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(
      makeEvent({ query: { include: "questions,notes" } }),
    );
    const questions = (
      response as { data: { questions: Array<Record<string, unknown>> } }
    ).data.questions;

    const withNote = questions.find(
      (q) => q.questionId === "q_p2_base_car_body_corrosion_bonnet",
    );
    expect(withNote?.questionNote).toBe("Minor scratch visible.");
  });

  it("does not include questionNote on questions without a recorded note", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DRAFT_ROW, error: null });

    const response = await summaryGetHandler(
      makeEvent({ query: { include: "questions,notes" } }),
    );
    const questions = (
      response as { data: { questions: Array<Record<string, unknown>> } }
    ).data.questions;

    const withoutNote = questions.find(
      (q) => q.questionId === "q_p2_base_car_body_corrosion_roof",
    );
    expect(withoutNote?.questionNote).toBeUndefined();
  });

  // ── 400 Bad Request ───────────────────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      summaryGetHandler(makeEvent({ inspectionId: "not-a-uuid" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when include contains an unknown expansion token", async () => {
    await expect(
      summaryGetHandler(makeEvent({ query: { include: "unknowntoken" } })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when include=notes without include=questions", async () => {
    await expect(
      summaryGetHandler(makeEvent({ query: { include: "notes" } })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(summaryGetHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(summaryGetHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────

  it("throws 500 when the database query fails", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "DB connection lost", code: "PGRST000" },
    });

    await expect(summaryGetHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
