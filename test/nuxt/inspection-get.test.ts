import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetInspectionDetailResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockMaybeSingle } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  return { mockMaybeSingle };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

vi.mock("#supabase/server", () => ({
  // serverSupabaseUser — used by getRequiredUserId to resolve the session.
  serverSupabaseUser: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }),
  // serverSupabaseServiceRole — returns a chainable select ending in maybeSingle.
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    }),
  }),
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: inspectionGetHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/index.get");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * Full DB row for an inspection with Part 1 populated and two answered questions.
 * The snapshot contains enough data to exercise scoreDistribution and progress computation.
 */
const STUB_DETAIL_ROW = {
  id: STUB_INSPECTION_ID,
  title: "Toyota Corolla 2016 ABC123",
  status: "draft",
  question_bank_version: "2026-05-01",
  snapshot_schema_version: "1.0.0",
  snapshot_version: 7,
  client_updated_at: "2026-05-01T12:30:00.000Z",
  created_at: "2026-05-01T12:00:00.000Z",
  updated_at: "2026-05-01T12:30:02.000Z",
  completed_at: null,
  // Relational Part 1 columns
  make: "Toyota",
  model: "Corolla",
  year_of_production: 2016,
  registration_number: "ABC123",
  vin_number: null,
  mileage: 80000,
  fuel_type: "Petrol",
  transmission: "Manual",
  drive: "2WD",
  color: "White",
  body_type: "Sedan",
  number_of_doors: 4,
  address: null,
  price: null,
  snapshot: {
    part_1: {
      notes: "Clean interior.",
    },
    runtime_flags: {
      chargingPortEquipped: false,
      evBatteryDocsAvailable: false,
      turboEquipped: false,
      mechanicalCompressorEquipped: false,
      importedFromEU: false,
    },
    answers: {
      q_brakes_pedal_feel: "yes",
      q_body_rust: "no",
    },
    question_notes: {
      q_brakes_pedal_feel: "Pedal feels stable.",
    },
    global_notes: "Overall clean cabin.",
    visible_group_ids: ["base_body"],
    visible_question_ids: [
      "q_brakes_pedal_feel",
      "q_body_rust",
      "q_lights_front",
    ],
  },
};

/** Row with no Part 1 data to exercise null part1 + disabled parts logic. */
const STUB_NO_PART1_ROW = {
  ...STUB_DETAIL_ROW,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  make: null,
  model: null,
  fuel_type: null,
  transmission: null,
  drive: null,
  body_type: null,
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
};

/** Completed inspection row to verify mode mapping. */
const STUB_COMPLETED_ROW = {
  ...STUB_DETAIL_ROW,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  status: "completed",
  completed_at: "2026-05-01T14:00:00.000Z",
};

// ── Event factory ──────────────────────────────────────────────────────────

/**
 * Builds a minimal H3Event stub for GET /api/v1/inspections/:inspectionId.
 * Router params are stored in event.context.params as H3 expects.
 * Query string is encoded into event.path so getValidatedQuery can parse it.
 */
function makeEvent(
  inspectionId: string = STUB_INSPECTION_ID,
  query: Record<string, string> = {},
): H3Event {
  const searchParams = new URLSearchParams(query);
  const qs = searchParams.toString();
  const path = `/api/v1/inspections/${inspectionId}${qs ? "?" + qs : ""}`;

  return {
    method: "GET",
    path,
    node: {
      req: {
        method: "GET",
        socket: { remoteAddress: "127.0.0.1" },
        headers: {},
        url: path,
      },
      res: {},
    },
    context: {
      params: { inspectionId },
    },
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/v1/inspections/:inspectionId handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── Success — 200 OK ──────────────────────────────────────────────────────

  it("returns a valid GetInspectionDetailResponse envelope on success", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    const response = await inspectionGetHandler(makeEvent());

    const parsed = GetInspectionDetailResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.id).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.title).toBe(STUB_DETAIL_ROW.title);
      expect(parsed.data.data.status).toBe("draft");
      expect(parsed.data.data.mode).toBe("editable");
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("maps Part 1 relational columns to part1 DTO", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    const response = await inspectionGetHandler(makeEvent());

    const parsed = GetInspectionDetailResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const { part1 } = parsed.data.data;
      expect(part1).not.toBeNull();
      expect(part1?.make).toBe("Toyota");
      expect(part1?.model).toBe("Corolla");
      expect(part1?.fuelType).toBe("Petrol");
      expect(part1?.notes).toBe("Clean interior.");
    }
  });

  it("returns null part1 and disabled parts when Part 1 columns are absent", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_NO_PART1_ROW,
      error: null,
    });

    const response = await inspectionGetHandler(
      makeEvent(STUB_NO_PART1_ROW.id),
    );

    const parsed = GetInspectionDetailResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.part1).toBeNull();

      const part1State = parsed.data.data.parts.find((p) => p.part === "part1");
      const part2State = parsed.data.data.parts.find((p) => p.part === "part2");
      expect(part1State?.enabled).toBe(true);
      expect(part1State?.completed).toBe(false);
      expect(part2State?.enabled).toBe(false);
    }
  });

  it("sets mode to editable for draft inspections", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    const response = await inspectionGetHandler(makeEvent());

    expect((response as { data: { mode: string } }).data.mode).toBe("editable");
  });

  it("sets mode to report for completed inspections", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_COMPLETED_ROW,
      error: null,
    });

    const response = await inspectionGetHandler(
      makeEvent(STUB_COMPLETED_ROW.id),
    );

    expect((response as { data: { mode: string } }).data.mode).toBe("report");
  });

  it("derives scoreDistribution from snapshot answers filtered to visibleQuestionIds", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    const response = await inspectionGetHandler(makeEvent());

    const parsed = GetInspectionDetailResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      // 3 visible questions: q_brakes_pedal_feel=yes, q_body_rust=no, q_lights_front=unanswered
      expect(parsed.data.data.scoreDistribution.yes).toBe(1);
      expect(parsed.data.data.scoreDistribution.no).toBe(1);
      expect(parsed.data.data.scoreDistribution.dontKnow).toBe(0);
    }
  });

  it("computes global progress from answers ∩ visibleQuestionIds", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    const response = await inspectionGetHandler(makeEvent());

    const parsed = GetInspectionDetailResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      // 3 visible questions, 2 answered
      expect(parsed.data.data.progress.visibleQuestions).toBe(3);
      expect(parsed.data.data.progress.answeredQuestions).toBe(2);
    }
  });

  it("enables parts 2–5 when Part 1 is completed", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    const response = await inspectionGetHandler(makeEvent());

    const parsed = GetInspectionDetailResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const parts = parsed.data.data.parts;
      expect(parts).toHaveLength(5);
      expect(parts.find((p) => p.part === "part1")?.enabled).toBe(true);
      expect(parts.find((p) => p.part === "part2")?.enabled).toBe(true);
      expect(parts.find((p) => p.part === "part5")?.enabled).toBe(true);
    }
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(inspectionGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // ── 400 Bad Request ───────────────────────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      inspectionGetHandler(makeEvent("not-a-uuid")),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when include contains an unknown expansion value", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    await expect(
      inspectionGetHandler(
        makeEvent(STUB_INSPECTION_ID, { include: "unknown-expansion" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts a valid include value without throwing", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_DETAIL_ROW, error: null });

    await expect(
      inspectionGetHandler(
        makeEvent(STUB_INSPECTION_ID, { include: "summary" }),
      ),
    ).resolves.toBeDefined();
  });

  // ── 401 Unauthorized ──────────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(inspectionGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
