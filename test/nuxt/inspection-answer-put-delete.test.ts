import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PutInspectionAnswerResponseSchema,
  DeleteInspectionAnswerResponseSchema,
} from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockMaybeSingle, mockRpc } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  const mockRpc = vi.fn();
  return { mockMaybeSingle, mockRpc };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

/**
 * Both answer services make two Supabase calls:
 *   1. from("inspections").select(...).eq(...).eq(...).maybeSingle()
 *      — fetches current snapshot for ownership/status/answers.
 *   2. client.rpc("save_inspection_answer" | "delete_inspection_answer", {...})
 *      — atomic write via the SQL function (skipped in no-op case for PUT).
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
    rpc: mockRpc,
  }),
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handlers AFTER mocks are established ───────────────────────────

const { default: answerPutHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/answers/[questionId]/index.put");

const { default: answerDeleteHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/answers/[questionId]/index.delete");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUB_QUESTION_ID = "q_p2_base_car_body_corrosion_bonnet";
const STUB_SNAPSHOT_VERSION = 9;

/** A minimal visible question snapshot with one question visible. */
const STUB_SNAPSHOT = {
  part_1: {
    make: "Toyota",
    model: "Corolla",
    fuelType: "Petrol",
    transmission: "Manual",
    drive: "2WD",
    bodyType: "Sedan",
    price: null,
    yearOfProduction: null,
    registrationNumber: null,
    vinNumber: null,
    mileage: null,
    color: null,
    numberOfDoors: null,
    address: null,
    notes: "",
  },
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
  visible_group_ids: ["grp_exterior"],
  visible_question_ids: [STUB_QUESTION_ID],
};

/** Row returned for a draft inspection with one visible question. */
const STUB_FETCH_ROW = {
  status: "draft",
  snapshot_version: STUB_SNAPSHOT_VERSION,
  snapshot: STUB_SNAPSHOT,
};

/** Row when an answer is already saved. */
const STUB_FETCH_ROW_WITH_ANSWER = {
  ...STUB_FETCH_ROW,
  snapshot: {
    ...STUB_SNAPSHOT,
    answers: { [STUB_QUESTION_ID]: "yes" },
  },
};

/** RPC rows returned after a successful save. */
function makeRpcRows(version = STUB_SNAPSHOT_VERSION + 1) {
  return [{ snapshot_version: version }];
}

/** Valid PUT body. */
const VALID_PUT_BODY = {
  answer: "yes",
  baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
  clientUpdatedAt: "2026-05-11T10:00:00Z",
} as const;

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(options: {
  method?: "PUT" | "DELETE";
  inspectionId?: string;
  questionId?: string;
  body?: unknown;
}): H3Event {
  const {
    method = "PUT",
    inspectionId = STUB_INSPECTION_ID,
    questionId = STUB_QUESTION_ID,
    body = VALID_PUT_BODY,
  } = options;

  const path = `/api/v1/inspections/${inspectionId}/answers/${questionId}`;

  return {
    method,
    path,
    node: {
      req: {
        method,
        url: path,
        socket: { remoteAddress: "127.0.0.1" },
        headers: {},
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
      params: { inspectionId, questionId },
    },
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── PUT setup helpers ──────────────────────────────────────────────────────

function setupPutSuccess() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });
}

function setupPutFetchError() {
  mockMaybeSingle.mockResolvedValue({
    data: null,
    error: { message: "db error", code: "500" },
  });
}

function setupPutRpcConflict() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({
    data: null,
    error: {
      message: "SNAPSHOT_CONFLICT",
      hint: "SNAPSHOT_CONFLICT",
      code: "P0004",
    },
  });
}

function setupPutRpcError() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({
    data: null,
    error: { message: "unexpected db error", code: "500" },
  });
}

// ── DELETE setup helpers ───────────────────────────────────────────────────

function setupDeleteSuccess() {
  mockMaybeSingle.mockResolvedValue({
    data: STUB_FETCH_ROW_WITH_ANSWER,
    error: null,
  });
  mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });
}

// ── PUT tests ─────────────────────────────────────────────────────────────

describe("PUT /api/v1/inspections/:inspectionId/answers/:questionId handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — success ──────────────────────────────────────────────────

  it("returns a valid PutInspectionAnswerResponse envelope on success", async () => {
    setupPutSuccess();

    const response = await answerPutHandler(makeEvent({ method: "PUT" }));

    const parsed = PutInspectionAnswerResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.questionId).toBe(STUB_QUESTION_ID);
      expect(parsed.data.data.answer).toBe("yes");
      expect(parsed.data.data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION + 1);
      expect(parsed.data.data.progress.visibleQuestions).toBe(1);
      expect(parsed.data.data.progress.answeredQuestions).toBe(1);
      expect(parsed.data.data.scoreDistribution.yes).toBe(1);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("calls the RPC with correct parameters", async () => {
    setupPutSuccess();

    await answerPutHandler(makeEvent({ method: "PUT" }));

    expect(mockRpc).toHaveBeenCalledWith(
      "save_inspection_answer",
      expect.objectContaining({
        p_user_id: STUB_USER_ID,
        p_inspection_id: STUB_INSPECTION_ID,
        p_question_id: STUB_QUESTION_ID,
        p_answer: "yes",
        p_base_snapshot_version: STUB_SNAPSHOT_VERSION,
      }),
    );
  });

  // ── 200 OK — no-op short-circuit ──────────────────────────────────────

  it("returns current snapshotVersion without calling RPC when answer is unchanged", async () => {
    // Snapshot already has "yes" stored for the question.
    mockMaybeSingle.mockResolvedValue({
      data: STUB_FETCH_ROW_WITH_ANSWER,
      error: null,
    });

    const response = await answerPutHandler(makeEvent({ method: "PUT" }));

    expect(mockRpc).not.toHaveBeenCalled();

    const data = (response as { data: { snapshotVersion: number } }).data;
    expect(data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION);
  });

  // ── 400 Bad Request — body ────────────────────────────────────────────

  it("throws 400 when body is null", async () => {
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", body: null })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body is an array", async () => {
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", body: [] })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 422 Unprocessable Entity — domain validation ───────────────────────

  it("throws 422 when answer is an invalid enum value", async () => {
    const body = { ...VALID_PUT_BODY, answer: "maybe" };
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when baseSnapshotVersion is missing", async () => {
    const { baseSnapshotVersion: _, ...body } = VALID_PUT_BODY;
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when clientUpdatedAt is not a valid ISO timestamp", async () => {
    const body = { ...VALID_PUT_BODY, clientUpdatedAt: "not-a-date" };
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when body contains unknown extra keys (strictObject)", async () => {
    const body = { ...VALID_PUT_BODY, extraField: "injected" };
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when questionId is not in visible question set", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    await expect(
      answerPutHandler(
        makeEvent({
          method: "PUT",
          questionId: "q_p2_invisible_question",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  // ── 400 Bad Request — route param ─────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      answerPutHandler(
        makeEvent({ method: "PUT", inspectionId: "not-a-uuid" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when questionId does not follow the q_ format", async () => {
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", questionId: "INVALID_ID" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ─────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(
      answerPutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      answerPutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 500 when the Supabase fetch returns an error", async () => {
    setupPutFetchError();

    await expect(
      answerPutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  // ── 409 Conflict ──────────────────────────────────────────────────────

  it("throws 409 when baseSnapshotVersion is stale", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    const body = {
      ...VALID_PUT_BODY,
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION - 1,
    };
    await expect(
      answerPutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 when inspection is completed", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...STUB_FETCH_ROW, status: "completed" },
      error: null,
    });

    await expect(
      answerPutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 when the RPC detects a snapshot conflict", async () => {
    setupPutRpcConflict();

    await expect(
      answerPutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────

  it("throws 500 when the RPC returns an unexpected error", async () => {
    setupPutRpcError();

    await expect(
      answerPutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ── DELETE tests ──────────────────────────────────────────────────────────

describe("DELETE /api/v1/inspections/:inspectionId/answers/:questionId handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — success ──────────────────────────────────────────────────

  it("returns a valid DeleteInspectionAnswerResponse envelope on success", async () => {
    setupDeleteSuccess();

    const response = await answerDeleteHandler(makeEvent({ method: "DELETE" }));

    const parsed = DeleteInspectionAnswerResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.questionId).toBe(STUB_QUESTION_ID);
      expect(parsed.data.data.deleted).toBe(true);
      expect(parsed.data.data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION + 1);
      expect(parsed.data.data.progress.answeredQuestions).toBe(0);
      expect(parsed.data.data.scoreDistribution.yes).toBe(0);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("calls the RPC with correct parameters", async () => {
    setupDeleteSuccess();

    await answerDeleteHandler(makeEvent({ method: "DELETE" }));

    expect(mockRpc).toHaveBeenCalledWith(
      "delete_inspection_answer",
      expect.objectContaining({
        p_user_id: STUB_USER_ID,
        p_inspection_id: STUB_INSPECTION_ID,
        p_question_id: STUB_QUESTION_ID,
      }),
    );
  });

  // ── 400 Bad Request — route param ─────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      answerDeleteHandler(
        makeEvent({ method: "DELETE", inspectionId: "not-a-uuid" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when questionId does not follow the q_ format", async () => {
    await expect(
      answerDeleteHandler(
        makeEvent({ method: "DELETE", questionId: "INVALID_ID" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ─────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(
      answerDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      answerDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 404 when answer does not exist for the question", async () => {
    // Snapshot has no answer for the question (answers: {}).
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    await expect(
      answerDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 404 when questionId is not in the visible question set", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_FETCH_ROW_WITH_ANSWER,
      error: null,
    });

    await expect(
      answerDeleteHandler(
        makeEvent({
          method: "DELETE",
          questionId: "q_p2_invisible_question",
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // ── 409 Conflict ──────────────────────────────────────────────────────

  it("throws 409 when inspection is completed", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...STUB_FETCH_ROW_WITH_ANSWER, status: "completed" },
      error: null,
    });

    await expect(
      answerDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────

  it("throws 500 when the Supabase fetch returns an error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db error", code: "500" },
    });

    await expect(
      answerDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("throws 500 when the RPC returns an unexpected error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_FETCH_ROW_WITH_ANSWER,
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "unexpected db error", code: "500" },
    });

    await expect(
      answerDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
