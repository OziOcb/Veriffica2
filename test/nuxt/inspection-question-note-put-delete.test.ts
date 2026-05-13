import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PutInspectionQuestionNoteResponseSchema,
  DeleteInspectionQuestionNoteResponseSchema,
} from "../../shared/contracts/inspections";
import type { H3Event } from "h3";
import { DEFAULT_USER_ID } from "~/db/supabase.client";
import {
  upsertQuestionNoteInDocument,
  removeQuestionNoteFromDocument,
} from "../../server/utils/services/inspection-note-document";

// ── Hoist shared mock state ────────────────────────────────────────────────

const { mockMaybeSingle, mockRpc, mockGetQuestionLabel } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn();
  const mockRpc = vi.fn();
  const mockGetQuestionLabel = vi
    .fn()
    .mockReturnValue("Car body corrosion on bonnet");
  return { mockMaybeSingle, mockRpc, mockGetQuestionLabel };
});

// ── Mock #supabase/server ──────────────────────────────────────────────────

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

// ── Mock question-bank (QUESTION_TEXT_BY_ID singleton) ────────────────────

vi.mock("../../server/utils/question-bank", () => ({
  QUESTION_TEXT_BY_ID: { get: mockGetQuestionLabel },
}));

// ── Import mocks for per-test control ─────────────────────────────────────

import { serverSupabaseUser } from "#supabase/server";

// ── Import handlers AFTER mocks are established ───────────────────────────

const { default: questionNotePutHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/question-notes/[questionId]/index.put");

const { default: questionNoteDeleteHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/question-notes/[questionId]/index.delete");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUB_QUESTION_ID = "q_p2_base_car_body_corrosion_bonnet";
const STUB_QUESTION_LABEL = "Car body corrosion on bonnet";
const STUB_NOTE = "Small paint mismatch near the rear door.";
const STUB_SNAPSHOT_VERSION = 10;

/**
 * Pre-computed global_notes that contains the mirrored note section for
 * STUB_QUESTION_ID. Used to set up no-op and DELETE scenarios.
 */
const STUB_GLOBAL_NOTES_WITH_NOTE = upsertQuestionNoteInDocument(
  "",
  STUB_QUESTION_ID,
  STUB_QUESTION_LABEL,
  STUB_NOTE,
);

/** global_notes after the note is removed (sentinel section gone). */
const STUB_GLOBAL_NOTES_AFTER_DELETE = removeQuestionNoteFromDocument(
  STUB_GLOBAL_NOTES_WITH_NOTE,
  STUB_QUESTION_ID,
);

const STUB_SNAPSHOT = {
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
  visible_group_ids: ["grp_exterior"],
  visible_question_ids: [STUB_QUESTION_ID],
};

/** Draft row, no notes yet. */
const STUB_FETCH_ROW = {
  status: "draft",
  snapshot_version: STUB_SNAPSHOT_VERSION,
  snapshot: STUB_SNAPSHOT,
};

/** Draft row with the note already stored (for no-op and DELETE scenarios). */
const STUB_FETCH_ROW_WITH_NOTE = {
  ...STUB_FETCH_ROW,
  snapshot: {
    ...STUB_SNAPSHOT,
    question_notes: { [STUB_QUESTION_ID]: STUB_NOTE },
    global_notes: STUB_GLOBAL_NOTES_WITH_NOTE,
  },
};

/** RPC row returned after a successful save/delete. */
function makeRpcRows(version = STUB_SNAPSHOT_VERSION + 1) {
  return [{ snapshot_version: version }];
}

/** Valid PUT body. */
const VALID_PUT_BODY = {
  note: STUB_NOTE,
  baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
  clientUpdatedAt: "2026-05-13T10:00:00Z",
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

  const path = `/api/v1/inspections/${inspectionId}/question-notes/${questionId}`;

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

// ── DELETE setup helpers ───────────────────────────────────────────────────

function setupDeleteSuccess() {
  mockMaybeSingle.mockResolvedValue({
    data: STUB_FETCH_ROW_WITH_NOTE,
    error: null,
  });
  mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUT tests
// ═══════════════════════════════════════════════════════════════════════════

describe("PUT /api/v1/inspections/:inspectionId/question-notes/:questionId handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpc.mockReset();
    mockGetQuestionLabel.mockReturnValue(STUB_QUESTION_LABEL);
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — success ──────────────────────────────────────────────────

  it("returns a valid PutInspectionQuestionNoteResponse envelope on success", async () => {
    setupPutSuccess();

    const response = await questionNotePutHandler(makeEvent({ method: "PUT" }));

    const parsed = PutInspectionQuestionNoteResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.questionId).toBe(STUB_QUESTION_ID);
      expect(parsed.data.data.questionNote).toBe(STUB_NOTE);
      expect(parsed.data.data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION + 1);
      expect(typeof parsed.data.data.globalNotes).toBe("string");
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("globalNotes contains the mirrored note sentinel section", async () => {
    setupPutSuccess();

    const response = await questionNotePutHandler(makeEvent({ method: "PUT" }));
    const data = (
      response as { data: { globalNotes: string; questionNote: string } }
    ).data;

    expect(data.globalNotes).toContain(`<!-- note:${STUB_QUESTION_ID} -->`);
    expect(data.globalNotes).toContain(data.questionNote);
  });

  it("calls the RPC with correct parameters", async () => {
    setupPutSuccess();

    await questionNotePutHandler(makeEvent({ method: "PUT" }));

    expect(mockRpc).toHaveBeenCalledWith(
      "save_inspection_question_note",
      expect.objectContaining({
        p_user_id: STUB_USER_ID,
        p_inspection_id: STUB_INSPECTION_ID,
        p_question_id: STUB_QUESTION_ID,
        p_note: STUB_NOTE,
        p_base_snapshot_version: STUB_SNAPSHOT_VERSION,
      }),
    );
  });

  it("passes computed global_notes to the RPC (not the raw input)", async () => {
    setupPutSuccess();

    await questionNotePutHandler(makeEvent({ method: "PUT" }));

    const callArgs = mockRpc.mock.calls[0][1] as { p_global_notes: string };
    expect(callArgs.p_global_notes).toContain(
      `<!-- note:${STUB_QUESTION_ID} -->`,
    );
    expect(callArgs.p_global_notes).toContain(STUB_NOTE);
  });

  // ── 200 OK — no-op short-circuit ──────────────────────────────────────

  it("returns current snapshotVersion without calling RPC when note is unchanged", async () => {
    // Snapshot already has exactly the same note and the matching global_notes.
    mockMaybeSingle.mockResolvedValue({
      data: STUB_FETCH_ROW_WITH_NOTE,
      error: null,
    });

    const response = await questionNotePutHandler(makeEvent({ method: "PUT" }));

    expect(mockRpc).not.toHaveBeenCalled();

    const data = (response as { data: { snapshotVersion: number } }).data;
    expect(data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION);
  });

  // ── 400 Bad Request — body ────────────────────────────────────────────

  it("throws 400 when body is null", async () => {
    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT", body: null })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body is an array", async () => {
    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT", body: [] })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 422 Unprocessable Entity — domain validation ───────────────────────

  it("throws 422 when note is an empty string (after trim)", async () => {
    const body = { ...VALID_PUT_BODY, note: "   " };
    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when note exceeds 500 characters", async () => {
    const body = { ...VALID_PUT_BODY, note: "x".repeat(501) };
    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when baseSnapshotVersion is missing", async () => {
    const { baseSnapshotVersion: _, ...body } = VALID_PUT_BODY;
    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when clientUpdatedAt is not a valid ISO timestamp", async () => {
    const body = { ...VALID_PUT_BODY, clientUpdatedAt: "not-a-date" };
    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when body contains unknown extra keys (strictObject)", async () => {
    const body = { ...VALID_PUT_BODY, extraField: "injected" };
    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when questionId is not in the visible question set", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    await expect(
      questionNotePutHandler(
        makeEvent({ method: "PUT", questionId: "q_p2_invisible_question" }),
      ),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  // ── 400 Bad Request — route param ─────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      questionNotePutHandler(
        makeEvent({ method: "PUT", inspectionId: "not-a-uuid" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when questionId does not follow the q_ format", async () => {
    await expect(
      questionNotePutHandler(
        makeEvent({ method: "PUT", questionId: "INVALID_ID" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ─────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 500 when the Supabase fetch returns an error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db error", code: "500" },
    });

    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT" })),
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
      questionNotePutHandler(makeEvent({ method: "PUT", body })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 when inspection is completed", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...STUB_FETCH_ROW, status: "completed" },
      error: null,
    });

    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 when the RPC detects a snapshot conflict", async () => {
    setupPutRpcConflict();

    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────

  it("throws 500 when the RPC returns an unexpected error", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "unexpected db error", code: "500" },
    });

    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("throws 500 when visible questionId has no label in the question bank", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
    mockGetQuestionLabel.mockReturnValueOnce(undefined);

    await expect(
      questionNotePutHandler(makeEvent({ method: "PUT" })),
    ).rejects.toMatchObject({ statusCode: 500 });

    expect(mockRpc).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE tests
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /api/v1/inspections/:inspectionId/question-notes/:questionId handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpc.mockReset();
    mockGetQuestionLabel.mockReturnValue(STUB_QUESTION_LABEL);
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — success ──────────────────────────────────────────────────

  it("returns a valid DeleteInspectionQuestionNoteResponse envelope on success", async () => {
    setupDeleteSuccess();

    const response = await questionNoteDeleteHandler(
      makeEvent({ method: "DELETE" }),
    );

    const parsed =
      DeleteInspectionQuestionNoteResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.questionId).toBe(STUB_QUESTION_ID);
      expect(parsed.data.data.deleted).toBe(true);
      expect(parsed.data.data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION + 1);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("calls the RPC with correct parameters including updated global_notes", async () => {
    setupDeleteSuccess();

    await questionNoteDeleteHandler(makeEvent({ method: "DELETE" }));

    expect(mockRpc).toHaveBeenCalledWith(
      "delete_inspection_question_note",
      expect.objectContaining({
        p_user_id: STUB_USER_ID,
        p_inspection_id: STUB_INSPECTION_ID,
        p_question_id: STUB_QUESTION_ID,
        p_global_notes: STUB_GLOBAL_NOTES_AFTER_DELETE,
      }),
    );
  });

  it("passes global_notes with sentinel section removed to the RPC", async () => {
    setupDeleteSuccess();

    await questionNoteDeleteHandler(makeEvent({ method: "DELETE" }));

    const callArgs = mockRpc.mock.calls[0][1] as { p_global_notes: string };
    expect(callArgs.p_global_notes).not.toContain(
      `<!-- note:${STUB_QUESTION_ID} -->`,
    );
  });

  // ── 400 Bad Request — route param ─────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      questionNoteDeleteHandler(
        makeEvent({ method: "DELETE", inspectionId: "not-a-uuid" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when questionId does not follow the q_ format", async () => {
    await expect(
      questionNoteDeleteHandler(
        makeEvent({ method: "DELETE", questionId: "INVALID_ID" }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ─────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(
      questionNoteDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      questionNoteDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 404 when no note exists for the question", async () => {
    // Snapshot has no question_notes at all.
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    await expect(
      questionNoteDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 404 when questionId is not in the visible question set", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_FETCH_ROW_WITH_NOTE,
      error: null,
    });

    await expect(
      questionNoteDeleteHandler(
        makeEvent({ method: "DELETE", questionId: "q_p2_invisible_question" }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // ── 409 Conflict ──────────────────────────────────────────────────────

  it("throws 409 when inspection is completed", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...STUB_FETCH_ROW_WITH_NOTE, status: "completed" },
      error: null,
    });

    await expect(
      questionNoteDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────

  it("throws 500 when the Supabase fetch returns an error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db error", code: "500" },
    });

    await expect(
      questionNoteDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("throws 500 when the RPC returns an unexpected error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: STUB_FETCH_ROW_WITH_NOTE,
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "unexpected db error", code: "500" },
    });

    await expect(
      questionNoteDeleteHandler(makeEvent({ method: "DELETE" })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});
