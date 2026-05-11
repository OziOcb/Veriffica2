import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetInspectionPartQuestionsResponseSchema } from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockMaybeSingle } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  return { mockMaybeSingle };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

vi.mock("#supabase/server", () => ({
  serverSupabaseUser: vi.fn().mockResolvedValue({ id: DEFAULT_USER_ID }),
  serverSupabaseServiceRole: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
    }),
  }),
}));

import { serverSupabaseUser } from "#supabase/server";

// ── Import handler AFTER mocks ─────────────────────────────────────────────

const { default: questionsGetHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/parts/[partId]/questions.get");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/**
 * Minimal DB row for an inspection with Part 1 populated.
 * Uses real question-bank IDs for `visible_group_ids` and
 * `visible_question_ids` so the service can match them against QUESTION_GROUPS
 * and QUESTIONS loaded at module scope.
 */
const STUB_ROW_WITH_PART1 = {
  id: STUB_INSPECTION_ID,
  user_id: STUB_USER_ID,
  question_bank_version: "2026-05-01",
  // Relational Part 1 columns — required for buildPart1 to return non-null
  make: "Toyota",
  model: "Corolla",
  year_of_production: 2018,
  registration_number: "XYZ789",
  vin_number: null,
  mileage: 60000,
  fuel_type: "Petrol",
  transmission: "Manual",
  drive: "2WD",
  color: "Silver",
  body_type: "Sedan",
  number_of_doors: 4,
  address: null,
  price: null,
  snapshot: {
    part_1: { notes: "" },
    runtime_flags: {
      chargingPortEquipped: false,
      evBatteryDocsAvailable: false,
      turboEquipped: false,
      mechanicalCompressorEquipped: false,
      importedFromEU: false,
    },
    answers: {
      "q-p2-base-car-body-corrosion-bonnet": "yes",
      "q-p2-base-car-body-corrosion-boot-lid": "no",
    },
    question_notes: {
      "q-p2-base-car-body-corrosion-bonnet": "Minor surface rust.",
    },
    global_notes: "",
    // These are real group/question IDs from question-mapping-config.json and
    // question-bank.json so the filter logic in the service can match them.
    visible_group_ids: [
      "g-p2-base-car-body-corrosion",
      "g-p2-base-car-body-repair-traces",
      "g-p2-fuel-combustion-coolant-condition",
    ],
    visible_question_ids: [
      "q-p2-base-car-body-corrosion-bonnet",
      "q-p2-base-car-body-corrosion-boot-lid",
      "q-p2-base-car-body-corrosion-fender",
      "q-p2-fuel-combustion-coolant-condition-lack-of-clarity",
      "q-p2-fuel-combustion-coolant-condition-smell-of-exhaust-fumes",
      "q-p2-fuel-combustion-coolant-condition-leaks",
    ],
  },
};

/** Row without Part 1 — triggers 422 guard. */
const STUB_ROW_NO_PART1 = {
  ...STUB_ROW_WITH_PART1,
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

// ── H3 event factory ───────────────────────────────────────────────────────

function makeEvent(
  inspectionId = STUB_INSPECTION_ID,
  partId = "part2",
  query: Record<string, string> = {},
): H3Event {
  const params = new URLSearchParams(query);
  const qs = params.toString();
  const path = `/api/v1/inspections/${inspectionId}/parts/${partId}/questions${qs ? `?${qs}` : ""}`;
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
      res: {
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      },
    },
    context: {
      params: { inspectionId, partId },
    },
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GET /api/v1/inspections/:inspectionId/parts/:partId/questions handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 success — no expansions ───────────────────────────────────────────

  it("returns a valid response envelope on success (no expansions)", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_ROW_WITH_PART1,
      error: null,
    });

    const response = await questionsGetHandler(makeEvent());

    const parsed = GetInspectionPartQuestionsResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.part).toBe("part2");
      expect(parsed.data.data.questionBankVersion).toBe("2026-05-01");
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("returns only visible questions for the requested part", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_ROW_WITH_PART1,
      error: null,
    });

    const response = await questionsGetHandler(makeEvent());

    const parsed = GetInspectionPartQuestionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      // All returned questions must belong to part2
      expect(
        parsed.data.data.questions.every((q) =>
          STUB_ROW_WITH_PART1.snapshot.visible_question_ids.includes(q.id),
        ),
      ).toBe(true);

      // No answer field without include=answers
      expect(
        parsed.data.data.questions.every((q) => q.answer === undefined),
      ).toBe(true);

      // No questionNote field without include=notes
      expect(
        parsed.data.data.questions.every((q) => q.questionNote === undefined),
      ).toBe(true);

      // No explanations without include=explanations
      expect(parsed.data.data.explanations).toBeUndefined();
    }
  });

  it("groups contain only visible questionIds", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_ROW_WITH_PART1,
      error: null,
    });

    const response = await questionsGetHandler(makeEvent());

    const parsed = GetInspectionPartQuestionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const allGroupQuestionIds = parsed.data.data.groups.flatMap(
        (g) => g.questionIds,
      );
      for (const id of allGroupQuestionIds) {
        expect(STUB_ROW_WITH_PART1.snapshot.visible_question_ids).toContain(id);
      }
    }
  });

  // ── 200 success — include=answers ─────────────────────────────────────────

  it("attaches answer field when include=answers is requested", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_ROW_WITH_PART1,
      error: null,
    });

    const response = await questionsGetHandler(
      makeEvent(STUB_INSPECTION_ID, "part2", { include: "answers" }),
    );

    const parsed = GetInspectionPartQuestionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const bonnet = parsed.data.data.questions.find(
        (q) => q.id === "q-p2-base-car-body-corrosion-bonnet",
      );
      expect(bonnet?.answer).toBe("yes");

      const bootLid = parsed.data.data.questions.find(
        (q) => q.id === "q-p2-base-car-body-corrosion-boot-lid",
      );
      expect(bootLid?.answer).toBe("no");

      // Unanswered question has no answer field
      const fender = parsed.data.data.questions.find(
        (q) => q.id === "q-p2-base-car-body-corrosion-fender",
      );
      expect(fender?.answer).toBeUndefined();
    }
  });

  // ── 200 success — include=notes ───────────────────────────────────────────

  it("attaches questionNote when include=notes is requested", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_ROW_WITH_PART1,
      error: null,
    });

    const response = await questionsGetHandler(
      makeEvent(STUB_INSPECTION_ID, "part2", { include: "notes" }),
    );

    const parsed = GetInspectionPartQuestionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const bonnet = parsed.data.data.questions.find(
        (q) => q.id === "q-p2-base-car-body-corrosion-bonnet",
      );
      expect(bonnet?.questionNote).toBe("Minor surface rust.");

      // Question without a note has no questionNote field
      const bootLid = parsed.data.data.questions.find(
        (q) => q.id === "q-p2-base-car-body-corrosion-boot-lid",
      );
      expect(bootLid?.questionNote).toBeUndefined();
    }
  });

  // ── 200 success — include=explanations ───────────────────────────────────

  it("includes explanations dictionary when include=explanations is requested", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_ROW_WITH_PART1,
      error: null,
    });

    const response = await questionsGetHandler(
      makeEvent(STUB_INSPECTION_ID, "part2", { include: "explanations" }),
    );

    const parsed = GetInspectionPartQuestionsResponseSchema.safeParse(response);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const lackOfClarity = parsed.data.data.questions.find(
        (q) =>
          q.id === "q-p2-fuel-combustion-coolant-condition-lack-of-clarity",
      );

      expect(lackOfClarity?.explanationRef).toBe("exp_001");
      expect(parsed.data.data.explanations).toMatchObject({
        exp_001: {
          title: "Explanation 1",
          content:
            "Damaged cylinder head, cylinder head gasket or engine block",
        },
        exp_002: {
          title: "Explanation 2",
          content:
            "Coolant leakage due to damaged rubber hoses, radiator, water pump, cylinder head or engine block",
        },
      });
      expect(Object.keys(parsed.data.data.explanations ?? {})).toHaveLength(2);
    }
  });

  // ── 401 Unauthorized ─────────────────────────────────────────────────────

  it("throws 401 when user session is missing", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(questionsGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────────

  it("throws 404 when the inspection does not exist", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(questionsGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  // ── 422 — niegotowy Part 1 ────────────────────────────────────────────────

  it("throws 422 when Part 1 columns are absent (inspection not ready)", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_ROW_NO_PART1,
      error: null,
    });

    await expect(questionsGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  // ── 400 — niepoprawny partId ──────────────────────────────────────────────

  it("throws 400 when partId is part1 (not a question part)", async () => {
    // getValidatedRouterParams + .parse() throws a ZodError which h3 wraps
    // as a 400 Bad Request — consistent with all other route param validation.
    await expect(
      questionsGetHandler(makeEvent(STUB_INSPECTION_ID, "part1")),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  // ── 400 — nieznana ekspansja ──────────────────────────────────────────────

  it("throws 400 when include contains an unknown expansion token", async () => {
    await expect(
      questionsGetHandler(
        makeEvent(STUB_INSPECTION_ID, "part2", { include: "unknown_token" }),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  // ── 500 — DB error ────────────────────────────────────────────────────────

  it("throws 500 when the database returns an error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection refused", code: "PGRST301" },
    });

    await expect(questionsGetHandler(makeEvent())).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
