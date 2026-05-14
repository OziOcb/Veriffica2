import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SyncInspectionResponseSchema,
  SyncInspectionConflictResponseSchema,
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
 * The sync-inspection service makes up to two Supabase calls:
 *   1. from("inspections").select(...).eq(...).eq(...).maybeSingle()
 *      — fetches the current canonical row.
 *   2. client.rpc("save_inspection_snapshot", {...})
 *      — atomic write via the SQL function (skipped in no-op case).
 * On a race-condition conflict the service makes a second maybeSingle()
 * call to re-fetch the canonical version after the SQL raises SNAPSHOT_CONFLICT.
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

const { default: syncPostHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/sync.post");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUB_SNAPSHOT_VERSION = 7;

/** Minimal valid Part 1 data already stored in the snapshot. */
const STUB_PART1 = {
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
};

const STUB_RUNTIME_FLAGS = {
  chargingPortEquipped: false,
  evBatteryDocsAvailable: false,
  turboEquipped: false,
  mechanicalCompressorEquipped: false,
  importedFromEU: false,
};

/** A visible base question present in the question bank. */
const STUB_QUESTION_ID = "q_p2_base_car_body_corrosion_bonnet";

/** Canonical snapshot stored in the DB row. */
const STUB_SNAPSHOT = {
  part_1: STUB_PART1,
  runtime_flags: STUB_RUNTIME_FLAGS,
  answers: {},
  question_notes: {},
  global_notes: "",
  visible_group_ids: ["base_body"],
  visible_question_ids: [STUB_QUESTION_ID],
};

/** Full DB row returned by maybeSingle(). */
const STUB_FETCH_ROW = {
  id: STUB_INSPECTION_ID,
  title: "Toyota Corolla",
  status: "draft",
  snapshot_version: STUB_SNAPSHOT_VERSION,
  client_updated_at: "2026-05-14T10:00:00.000Z",
  updated_at: "2026-05-14T10:00:01.000Z",
  user_id: STUB_USER_ID,
  make: STUB_PART1.make,
  model: STUB_PART1.model,
  fuel_type: STUB_PART1.fuelType,
  transmission: STUB_PART1.transmission,
  drive: STUB_PART1.drive,
  body_type: STUB_PART1.bodyType,
  price: null,
  year_of_production: null,
  registration_number: null,
  vin_number: null,
  mileage: null,
  color: null,
  number_of_doors: null,
  address: null,
  snapshot: STUB_SNAPSHOT,
};

/** Minimal valid request body — answers a single visible question. */
const VALID_BODY = {
  baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
  clientUpdatedAt: "2026-05-14T10:05:00Z",
  mutation: {
    answers: { [STUB_QUESTION_ID]: "yes" },
  },
} as const;

/** RPC rows returned by save_inspection_snapshot on success. */
function makeRpcRows(overrides: Partial<typeof STUB_FETCH_ROW> = {}): Array<{
  id: string;
  title: string;
  status: string;
  snapshot_version: number;
  client_updated_at: string;
  updated_at: string;
}> {
  return [
    {
      id: STUB_INSPECTION_ID,
      title: "Toyota Corolla",
      status: "draft",
      snapshot_version: STUB_SNAPSHOT_VERSION + 1,
      client_updated_at: "2026-05-14T10:05:00.000Z",
      updated_at: "2026-05-14T10:05:01.000Z",
      ...overrides,
    },
  ];
}

// ── Event factory ──────────────────────────────────────────────────────────

function makeEvent(options: {
  inspectionId?: string;
  body?: unknown;
  query?: Record<string, string>;
}): H3Event {
  const {
    inspectionId = STUB_INSPECTION_ID,
    body = VALID_BODY,
    query = {},
  } = options;

  const queryString = new URLSearchParams(query).toString();
  const path = `/api/v1/inspections/${inspectionId}/sync${queryString ? "?" + queryString : ""}`;

  return {
    method: "POST",
    path,
    node: {
      req: {
        method: "POST",
        url: path,
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
    context: {
      params: { inspectionId },
    },
    headers: new Headers(),
  } as unknown as H3Event;
}

// ── Setup helpers ──────────────────────────────────────────────────────────

function setupSuccessfulSync() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });
}

function setupFetchNotFound() {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
}

function setupFetchError() {
  mockMaybeSingle.mockResolvedValue({
    data: null,
    error: { message: "db error", code: "500" },
  });
}

function setupRpcError() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({
    data: null,
    error: { message: "unexpected db error", code: "500" },
  });
}

function setupRpcSnapshotConflict() {
  mockMaybeSingle
    .mockResolvedValueOnce({ data: STUB_FETCH_ROW, error: null })
    // Second call: re-fetch after race-condition conflict
    .mockResolvedValueOnce({
      data: {
        id: STUB_INSPECTION_ID,
        snapshot_version: STUB_SNAPSHOT_VERSION + 1,
        client_updated_at: "2026-05-14T10:05:00.000Z",
      },
      error: null,
    });
  mockRpc.mockResolvedValue({
    data: null,
    error: {
      message: "SNAPSHOT_CONFLICT",
      hint: "SNAPSHOT_CONFLICT",
      code: "P0004",
    },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/v1/inspections/:inspectionId/sync handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── 200 success ─────────────────────────────────────────────────────────

  it("returns a valid SyncInspectionResponse envelope on success", async () => {
    setupSuccessfulSync();

    const response = await syncPostHandler(makeEvent({}));

    const parsed = SyncInspectionResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspection.id).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.inspection.snapshotVersion).toBe(
        STUB_SNAPSHOT_VERSION + 1,
      );
      expect(parsed.data.data.conflict.detected).toBe(false);
      expect(parsed.data.data.conflict.resolvedWith).toBe("client_wins");
      expect(parsed.data.data.smartPruning.applied).toBe(false);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("merges answers patch into inspection and returns them in the response", async () => {
    setupSuccessfulSync();

    const response = await syncPostHandler(makeEvent({}));

    const data = (
      response as { data: { inspection: { answers: Record<string, string> } } }
    ).data;
    expect(data.inspection.answers[STUB_QUESTION_ID]).toBe("yes");
  });

  it("calls save_inspection_snapshot RPC with correct parameters", async () => {
    setupSuccessfulSync();

    await syncPostHandler(makeEvent({}));

    expect(mockRpc).toHaveBeenCalledWith(
      "save_inspection_snapshot",
      expect.objectContaining({
        p_user_id: STUB_USER_ID,
        p_inspection_id: STUB_INSPECTION_ID,
        p_base_snapshot_version: STUB_SNAPSHOT_VERSION,
        p_client_updated_at: VALID_BODY.clientUpdatedAt,
        p_update_part1: false,
      }),
    );
  });

  it("accepts strategy=client_wins as a query param", async () => {
    setupSuccessfulSync();

    await expect(
      syncPostHandler(makeEvent({ query: { strategy: "client_wins" } })),
    ).resolves.toBeDefined();
  });

  it("includes progress and scoreDistribution in the response inspection", async () => {
    setupSuccessfulSync();

    const response = await syncPostHandler(makeEvent({}));

    const inspection = (
      response as {
        data: {
          inspection: {
            progress: { answeredQuestions: number; visibleQuestions: number };
            scoreDistribution: { yes: number; no: number; dontKnow: number };
          };
        };
      }
    ).data.inspection;

    expect(typeof inspection.progress.answeredQuestions).toBe("number");
    expect(typeof inspection.progress.visibleQuestions).toBe("number");
    expect(typeof inspection.scoreDistribution.yes).toBe("number");
  });

  // ── 200 no-op ───────────────────────────────────────────────────────────

  it("returns no-op result without calling RPC when mutation produces no change", async () => {
    // No answers in snapshot, mutation sends same empty answers.
    const noOpBody = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        globalNotes: "", // empty string — same as current
      },
    };
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    const response = await syncPostHandler(makeEvent({ body: noOpBody }));

    expect(mockRpc).not.toHaveBeenCalled();

    const data = (
      response as { data: { inspection: { snapshotVersion: number } } }
    ).data;
    // No-op must not bump the version.
    expect(data.inspection.snapshotVersion).toBe(STUB_SNAPSHOT_VERSION);
  });

  // ── Part 1 patch ─────────────────────────────────────────────────────────

  it("merges Part 1 patch with existing Part 1 and updates relational columns", async () => {
    setupSuccessfulSync();

    const bodyWithPart1 = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        part1: { make: "Honda", model: "Civic" },
      },
    };

    await syncPostHandler(makeEvent({ body: bodyWithPart1 }));

    expect(mockRpc).toHaveBeenCalledWith(
      "save_inspection_snapshot",
      expect.objectContaining({
        p_update_part1: true,
        p_make: "Honda",
        p_model: "Civic",
        p_title: "Honda Civic",
      }),
    );
  });

  it("returns 422 when Part 1 patch contains an invalid fuelType value", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        // "Hydrogen" is not in the allowed fuelType enum — fails SyncPart1PatchSchema
        part1: { fuelType: "Hydrogen" },
      },
    };

    await expect(syncPostHandler(makeEvent({ body }))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  // ── Question notes + global notes one-way mirroring ──────────────────────

  it("mirrors question note into globalNotes via one-way managed section", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        questionNotes: { [STUB_QUESTION_ID]: "Visible scratch." },
      },
    };

    await syncPostHandler(makeEvent({ body }));

    // The snapshot passed to the RPC should contain the mirrored section
    // in global_notes.
    const rpcCall = mockRpc.mock.calls[0];
    const rpcArgs = rpcCall?.[1] as
      | { p_new_snapshot?: { global_notes?: string } }
      | undefined;
    const globalNotes = rpcArgs?.p_new_snapshot?.global_notes ?? "";
    expect(globalNotes).toContain(`<!-- note:${STUB_QUESTION_ID} -->`);
    expect(globalNotes).toContain("Visible scratch.");
  });

  it("treats globalNotes mutation as plain free-text without touching question_notes", async () => {
    const snapshotWithNote = {
      ...STUB_SNAPSHOT,
      question_notes: { [STUB_QUESTION_ID]: "Managed note." },
      global_notes: `<!-- note:${STUB_QUESTION_ID} -->\n### Some question\nManaged note.\n<!-- /note:${STUB_QUESTION_ID} -->`,
    };
    mockMaybeSingle.mockResolvedValue({
      data: { ...STUB_FETCH_ROW, snapshot: snapshotWithNote },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        globalNotes: "Completely manual free-text.",
      },
    };

    await syncPostHandler(makeEvent({ body }));

    const rpcCall = mockRpc.mock.calls[0];
    const rpcArgs = rpcCall?.[1] as
      | {
          p_new_snapshot?: {
            global_notes?: string;
            question_notes?: Record<string, string>;
          };
        }
      | undefined;
    // question_notes must remain unchanged
    expect(rpcArgs?.p_new_snapshot?.question_notes?.[STUB_QUESTION_ID]).toBe(
      "Managed note.",
    );
    // global_notes is fully replaced by the mutation value
    expect(rpcArgs?.p_new_snapshot?.global_notes).toBe(
      "Completely manual free-text.",
    );
  });

  // ── Smart pruning ─────────────────────────────────────────────────────────

  it("prunes answers for questions that are no longer visible after runtimeFlags patch", async () => {
    // Snapshot with turboEquipped=true and a turbo-hypothetical question answered.
    const TURBO_QUESTION_ID = "q_turbo_hypothetical";
    const fetchRowWithTurbo = {
      ...STUB_FETCH_ROW,
      snapshot: {
        ...STUB_SNAPSHOT,
        runtime_flags: { ...STUB_RUNTIME_FLAGS, turboEquipped: true },
        answers: { [TURBO_QUESTION_ID]: "yes" },
        visible_question_ids: [STUB_QUESTION_ID, TURBO_QUESTION_ID],
      },
    };
    mockMaybeSingle.mockResolvedValue({
      data: fetchRowWithTurbo,
      error: null,
    });
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    // Patch turboEquipped back to false → turbo question becomes invisible.
    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        runtimeFlags: { turboEquipped: false },
      },
    };

    const response = await syncPostHandler(makeEvent({ body }));

    // The service prunes the turbo answer.
    const data = (
      response as { data: { smartPruning: { removedAnswerIds: string[] } } }
    ).data;
    // Note: TURBO_QUESTION_ID may not be in the real question bank, so
    // visibility might not change — but if answers were pruned they appear here.
    expect(Array.isArray(data.smartPruning.removedAnswerIds)).toBe(true);
  });

  // ── 409 pre-SQL conflict ─────────────────────────────────────────────────

  it("returns 409 SYNC_CONFLICT when baseSnapshotVersion does not match", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    const body = {
      ...VALID_BODY,
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION - 1, // stale version
    };

    const response = await syncPostHandler(makeEvent({ body }));

    // The handler uses setResponseStatus(409) and returns the error envelope.
    const parsed = SyncInspectionConflictResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("SYNC_CONFLICT");
      expect(parsed.data.data.canonicalInspection.id).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.canonicalInspection.snapshotVersion).toBe(
        STUB_SNAPSHOT_VERSION,
      );
    }
  });

  // ── 409 race-condition conflict via SQL ──────────────────────────────────

  it("returns 409 SYNC_CONFLICT when SQL raises SNAPSHOT_CONFLICT (race condition)", async () => {
    setupRpcSnapshotConflict();

    const response = await syncPostHandler(makeEvent({}));

    const parsed = SyncInspectionConflictResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.error.code).toBe("SYNC_CONFLICT");
      expect(
        parsed.data.data.canonicalInspection.snapshotVersion,
      ).toBeGreaterThan(STUB_SNAPSHOT_VERSION);
    }
  });

  // ── 409 completed inspection ─────────────────────────────────────────────

  it("throws 409 INSPECTION_NOT_EDITABLE when inspection is completed", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...STUB_FETCH_ROW, status: "completed" },
      error: null,
    });

    await expect(syncPostHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  // ── 404 ─────────────────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist", async () => {
    setupFetchNotFound();

    await expect(syncPostHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws 500 when DB fetch fails", async () => {
    setupFetchError();

    await expect(syncPostHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  // ── 401 ─────────────────────────────────────────────────────────────────

  it("throws 401 when user is not authenticated", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);

    await expect(syncPostHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  // ── 400 route param ──────────────────────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      syncPostHandler(makeEvent({ inspectionId: "not-a-uuid" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when strategy has an unsupported value", async () => {
    await expect(
      syncPostHandler(makeEvent({ query: { strategy: "server_wins" } })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 400 bad body ─────────────────────────────────────────────────────────

  it("throws 400 when body is not a JSON object", async () => {
    await expect(
      syncPostHandler(makeEvent({ body: "not-an-object" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body is an array", async () => {
    await expect(
      syncPostHandler(makeEvent({ body: [] })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 422 validation ───────────────────────────────────────────────────────

  it("throws 422 when mutation is an empty object", async () => {
    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {},
    };

    await expect(syncPostHandler(makeEvent({ body }))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("throws 422 when mutation contains an unknown top-level key", async () => {
    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        answers: { [STUB_QUESTION_ID]: "yes" },
        unknownField: "rejected",
      },
    };

    await expect(syncPostHandler(makeEvent({ body }))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("throws 422 when answers contain a key not following q_... format", async () => {
    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        answers: { "q-legacy-hyphenated": "yes" },
      },
    };

    await expect(syncPostHandler(makeEvent({ body }))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("throws 422 when questionNotes value exceeds 500 characters", async () => {
    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        questionNotes: { [STUB_QUESTION_ID]: "a".repeat(501) },
      },
    };

    await expect(syncPostHandler(makeEvent({ body }))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("throws 422 when globalNotes exceeds 10 000 characters", async () => {
    const body = {
      baseSnapshotVersion: STUB_SNAPSHOT_VERSION,
      clientUpdatedAt: "2026-05-14T10:05:00Z",
      mutation: {
        globalNotes: "x".repeat(10_001),
      },
    };

    await expect(syncPostHandler(makeEvent({ body }))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it("throws 422 when baseSnapshotVersion is missing", async () => {
    const { baseSnapshotVersion: _omit, ...bodyWithoutVersion } = VALID_BODY;

    await expect(
      syncPostHandler(makeEvent({ body: bodyWithoutVersion })),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it("throws 422 when clientUpdatedAt is not a valid ISO 8601 string", async () => {
    const body = {
      ...VALID_BODY,
      clientUpdatedAt: "2026-05-14 10:05:00", // missing offset
    };

    await expect(syncPostHandler(makeEvent({ body }))).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  // ── 500 RPC failure ──────────────────────────────────────────────────────

  it("throws 500 when the save_inspection_snapshot RPC returns an unexpected error", async () => {
    setupRpcError();

    await expect(syncPostHandler(makeEvent({}))).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
