import { beforeEach, describe, expect, it, vi } from "vitest";
import { PutInspectionGlobalNotesResponseSchema } from "../../shared/contracts/inspections";
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
 * The global-notes service makes two Supabase calls:
 *   1. from("inspections").select(...).eq(...).eq(...).maybeSingle()
 *      — fetches current snapshot for ownership/status/concurrency checks.
 *   2. client.rpc("save_inspection_global_notes", {...})
 *      — atomic write via the SQL function (skipped on no-op).
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

// ── Import handler AFTER mocks are established ────────────────────────────

const { default: globalNotesPutHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/global-notes.put");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STUB_SNAPSHOT_VERSION = 12;

/** Existing global notes already in the snapshot. */
const STUB_EXISTING_GLOBAL_NOTES =
  "Overall clean interior. Some tire wear noted.";

/** New global notes sent by the client. */
const STUB_NEW_GLOBAL_NOTES = "Overall clean interior. Minor tire wear.";

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
  question_notes: { q_p2_base_car_body_corrosion_bonnet: "A note" },
  global_notes: STUB_EXISTING_GLOBAL_NOTES,
  visible_group_ids: [],
  visible_question_ids: [],
};

/** Draft row with existing global notes. */
const STUB_FETCH_ROW = {
  status: "draft",
  snapshot_version: STUB_SNAPSHOT_VERSION,
  snapshot: STUB_SNAPSHOT,
};

/** RPC row returned after a successful save. */
function makeRpcRows(version = STUB_SNAPSHOT_VERSION + 1) {
  return [{ snapshot_version: version }];
}

/** Valid PUT body. */
const VALID_PUT_BODY = {
  globalNotes: STUB_NEW_GLOBAL_NOTES,
  baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
  clientUpdatedAt: "2026-05-13T13:00:00Z",
} as const;

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(options: {
  inspectionId?: string;
  body?: unknown;
}): H3Event {
  const { inspectionId = STUB_INSPECTION_ID, body = VALID_PUT_BODY } = options;

  const path = `/api/v1/inspections/${inspectionId}/global-notes`;

  return {
    method: "PUT",
    path,
    node: {
      req: {
        method: "PUT",
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
      params: { inspectionId },
    },
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Setup helpers ──────────────────────────────────────────────────────────

function setupSuccess() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });
}

function setupRpcConflict() {
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

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("PUT /api/v1/inspections/:inspectionId/global-notes handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 OK — success ──────────────────────────────────────────────────

  it("returns a valid PutInspectionGlobalNotesResponse envelope on success", async () => {
    setupSuccess();

    const response = await globalNotesPutHandler(makeEvent({}));

    const parsed = PutInspectionGlobalNotesResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.globalNotes).toBe(STUB_NEW_GLOBAL_NOTES);
      expect(parsed.data.data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION + 1);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("calls the RPC with correct parameters", async () => {
    setupSuccess();

    await globalNotesPutHandler(makeEvent({}));

    expect(mockRpc).toHaveBeenCalledWith(
      "save_inspection_global_notes",
      expect.objectContaining({
        p_user_id: STUB_USER_ID,
        p_inspection_id: STUB_INSPECTION_ID,
        p_global_notes: STUB_NEW_GLOBAL_NOTES,
        p_base_snapshot_version: STUB_SNAPSHOT_VERSION,
      }),
    );
  });

  it("does NOT pass question_notes to the RPC (global-notes endpoint must not touch question_notes)", async () => {
    setupSuccess();

    await globalNotesPutHandler(makeEvent({}));

    const callArgs = mockRpc.mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("p_question_notes");
    expect(callArgs).not.toHaveProperty("p_question_id");
  });

  it("allows empty string as globalNotes (document clearing)", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const body = { ...VALID_PUT_BODY, globalNotes: "" };
    const response = await globalNotesPutHandler(makeEvent({ body }));

    const data = (response as { data: { globalNotes: string } }).data;
    expect(data.globalNotes).toBe("");
    expect(mockRpc).toHaveBeenCalledWith(
      "save_inspection_global_notes",
      expect.objectContaining({ p_global_notes: "" }),
    );
  });

  // ── 200 OK — no-op short-circuit ──────────────────────────────────────

  it("returns current snapshotVersion without calling RPC when globalNotes is unchanged", async () => {
    // Snapshot already has identical global_notes content.
    const body = {
      ...VALID_PUT_BODY,
      globalNotes: STUB_EXISTING_GLOBAL_NOTES,
    };
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    const response = await globalNotesPutHandler(makeEvent({ body }));

    expect(mockRpc).not.toHaveBeenCalled();

    const data = (
      response as { data: { snapshotVersion: number; globalNotes: string } }
    ).data;
    expect(data.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION);
    expect(data.globalNotes).toBe(STUB_EXISTING_GLOBAL_NOTES);
  });

  // ── 400 Bad Request — body ────────────────────────────────────────────

  it("throws 400 when body is null", async () => {
    await expect(
      globalNotesPutHandler(makeEvent({ body: null })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body is an array", async () => {
    await expect(
      globalNotesPutHandler(makeEvent({ body: [] })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 422 Unprocessable Entity — domain validation ───────────────────────

  it("throws 422 when globalNotes exceeds 10 000 characters", async () => {
    const body = { ...VALID_PUT_BODY, globalNotes: "x".repeat(10_001) };
    await expect(
      globalNotesPutHandler(makeEvent({ body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when baseSnapshotVersion is missing", async () => {
    const { baseSnapshotVersion: _, ...body } = VALID_PUT_BODY;
    await expect(
      globalNotesPutHandler(makeEvent({ body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when clientUpdatedAt is not a valid ISO timestamp", async () => {
    const body = { ...VALID_PUT_BODY, clientUpdatedAt: "not-a-date" };
    await expect(
      globalNotesPutHandler(makeEvent({ body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when body contains unknown extra keys (strictObject)", async () => {
    const body = { ...VALID_PUT_BODY, extraField: "injected" };
    await expect(
      globalNotesPutHandler(makeEvent({ body })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  // ── 400 Bad Request — route param ─────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      globalNotesPutHandler(makeEvent({ inspectionId: "not-a-uuid" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 401 Unauthorized ─────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(globalNotesPutHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  // ── 404 Not Found ─────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist or belongs to another user", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(globalNotesPutHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws 500 when the Supabase fetch returns an error", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db error", code: "500" },
    });

    await expect(globalNotesPutHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  // ── 409 Conflict ──────────────────────────────────────────────────────

  it("throws 409 when baseSnapshotVersion is stale", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    const body = {
      ...VALID_PUT_BODY,
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION - 1,
    };
    await expect(
      globalNotesPutHandler(makeEvent({ body })),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 409 when inspection is completed", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...STUB_FETCH_ROW, status: "completed" },
      error: null,
    });

    await expect(globalNotesPutHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("throws 409 when the RPC detects a snapshot conflict", async () => {
    setupRpcConflict();

    await expect(globalNotesPutHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  // ── 500 Internal Server Error ─────────────────────────────────────────

  it("throws 500 when the RPC returns an unexpected error", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "unexpected db error", code: "500" },
    });

    await expect(globalNotesPutHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
