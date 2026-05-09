import { beforeEach, describe, expect, it, vi } from "vitest";
import { PutInspectionPart1ResponseSchema } from "../../shared/contracts/inspections";
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
 * The save-inspection-part1 service makes two Supabase calls:
 *   1. from("inspections").select(...).eq(...).eq(...).maybeSingle()
 *      — fetches current snapshot for runtime flags and existing answers.
 *   2. client.rpc("save_inspection_part1", {...})
 *      — atomic write via the SQL function.
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

const { default: part1PutHandler } =
  await import("../../server/api/v1/inspections/[inspectionId]/part-1.put");

// ── Stub data ──────────────────────────────────────────────────────────────

const STUB_USER_ID = DEFAULT_USER_ID;
const STUB_INSPECTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Minimal valid command body — all required fields present. */
const VALID_BODY = {
  make: "Toyota",
  model: "Corolla",
  fuelType: "Petrol",
  transmission: "Manual",
  drive: "2WD",
  bodyType: "Sedan",
} as const;

/** Snapshot returned by the initial maybeSingle() fetch. */
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
  visible_group_ids: [],
  visible_question_ids: [],
};

/** Row returned by the maybeSingle() fetch. */
const STUB_FETCH_ROW = {
  snapshot_version: 2,
  client_updated_at: "2026-05-09T10:00:00.000Z",
  snapshot: STUB_SNAPSHOT,
};

/** Rows returned by the save_inspection_part1 RPC. */
function makeRpcRows(overrides: Partial<typeof STUB_FETCH_ROW> = {}) {
  return [
    {
      id: STUB_INSPECTION_ID,
      title: "Toyota Corolla",
      snapshot_version: 3,
      client_updated_at: "2026-05-09T11:00:00.000Z",
      snapshot: STUB_SNAPSHOT,
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
  // h3 v1's getQuery reads from event.path (not event.node.req.url).
  const path = `/api/v1/inspections/${inspectionId}/part-1${queryString ? "?" + queryString : ""}`;

  return {
    method: "PUT",
    path,
    node: {
      req: {
        method: "PUT",
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

function setupSuccessfulSave() {
  mockMaybeSingle.mockResolvedValue({
    data: STUB_FETCH_ROW,
    error: null,
  });
  mockRpc.mockResolvedValue({
    data: makeRpcRows(),
    error: null,
  });
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

function setupRpcNotFound() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({
    data: null,
    error: { message: "NOT_FOUND", hint: "NOT_FOUND", code: "P0003" },
  });
}

function setupRpcError() {
  mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
  mockRpc.mockResolvedValue({
    data: null,
    error: { message: "unexpected db error", code: "500" },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PUT /api/v1/inspections/:inspectionId/part-1 handler", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpc.mockReset();
    vi.mocked(serverSupabaseUser).mockResolvedValue({
      id: STUB_USER_ID,
    } as unknown as Awaited<ReturnType<typeof serverSupabaseUser>>);
  });

  // ── Success — 200 OK ────────────────────────────────────────────────────

  it("returns a valid PutInspectionPart1Response envelope on success", async () => {
    setupSuccessfulSave();

    const response = await part1PutHandler(makeEvent({ body: VALID_BODY }));

    const parsed = PutInspectionPart1ResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    if (parsed.success) {
      expect(parsed.data.data.inspectionId).toBe(STUB_INSPECTION_ID);
      expect(parsed.data.data.part1.make).toBe("Toyota");
      expect(parsed.data.data.part1.model).toBe("Corolla");
      expect(parsed.data.data.title).toBe("Toyota Corolla");
      expect(parsed.data.data.unlockedParts).toEqual([
        "part2",
        "part3",
        "part4",
        "part5",
      ]);
      expect(parsed.data.data.snapshotVersion).toBe(3);
      expect(typeof parsed.data.meta.requestId).toBe("string");
      expect(typeof parsed.data.meta.timestamp).toBe("string");
    }
  });

  it("includes yearOfProduction and registrationNumber in title when provided", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });
    mockRpc.mockResolvedValue({ data: makeRpcRows(), error: null });

    const body = {
      ...VALID_BODY,
      yearOfProduction: 2020,
      registrationNumber: "WX12345",
    };

    await part1PutHandler(makeEvent({ body }));

    // The title is computed from Part 1 fields before the RPC call.
    // Verify the correct title was passed to the SQL function.
    expect(mockRpc).toHaveBeenCalledWith(
      "save_inspection_part1",
      expect.objectContaining({ p_title: "Toyota Corolla 2020 WX12345" }),
    );
  });

  it("normalizes make and model by collapsing whitespace", async () => {
    setupSuccessfulSave();

    const body = { ...VALID_BODY, make: "  Toyota  ", model: "  Corolla  " };
    const response = await part1PutHandler(makeEvent({ body }));

    expect(
      (response as { data: { part1: { make: string; model: string } } }).data
        .part1.make,
    ).toBe("Toyota");
    expect(
      (response as { data: { part1: { make: string; model: string } } }).data
        .part1.model,
    ).toBe("Corolla");
  });

  it("returns smartPruning.applied=false when no answers are pruned", async () => {
    setupSuccessfulSave();

    const response = await part1PutHandler(makeEvent({ body: VALID_BODY }));
    expect(
      (response as { data: { smartPruning: { applied: boolean } } }).data
        .smartPruning.applied,
    ).toBe(false);
  });

  it("returns visible group and question IDs", async () => {
    setupSuccessfulSave();

    const response = await part1PutHandler(makeEvent({ body: VALID_BODY }));
    const data = (
      response as {
        data: { visibleGroupIds: string[]; visibleQuestionIds: string[] };
      }
    ).data;
    expect(Array.isArray(data.visibleGroupIds)).toBe(true);
    expect(Array.isArray(data.visibleQuestionIds)).toBe(true);
    expect(data.visibleGroupIds.length).toBeGreaterThan(0);
    expect(data.visibleQuestionIds.length).toBeGreaterThan(0);
  });

  // ── dryRun mode ─────────────────────────────────────────────────────────

  it("skips the RPC call and returns computed result in dryRun mode", async () => {
    mockMaybeSingle.mockResolvedValue({ data: STUB_FETCH_ROW, error: null });

    const response = await part1PutHandler(
      makeEvent({ body: VALID_BODY, query: { dryRun: "true" } }),
    );

    expect(mockRpc).not.toHaveBeenCalled();

    const parsed = PutInspectionPart1ResponseSchema.safeParse(response);
    expect(parsed.success, JSON.stringify(parsed.error)).toBe(true);

    // dryRun uses the current snapshotVersion (not incremented).
    if (parsed.success) {
      expect(parsed.data.data.snapshotVersion).toBe(
        STUB_FETCH_ROW.snapshot_version,
      );
    }
  });

  it("dryRun=false string triggers a real RPC call", async () => {
    setupSuccessfulSave();

    await part1PutHandler(
      makeEvent({ body: VALID_BODY, query: { dryRun: "false" } }),
    );

    expect(mockRpc).toHaveBeenCalledOnce();
  });

  // ── Cross-field validation ───────────────────────────────────────────────

  it("throws 400 when Electric fuelType is combined with Manual transmission", async () => {
    await expect(
      part1PutHandler(
        makeEvent({
          body: { ...VALID_BODY, fuelType: "Electric", transmission: "Manual" },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts Electric fuelType with Automatic transmission", async () => {
    setupSuccessfulSave();

    await expect(
      part1PutHandler(
        makeEvent({
          body: {
            ...VALID_BODY,
            fuelType: "Electric",
            transmission: "Automatic",
          },
        }),
      ),
    ).resolves.toBeDefined();
  });

  // ── Required field validation ────────────────────────────────────────────

  it("throws 400 when make is missing", async () => {
    const { make: _make, ...bodyWithoutMake } = VALID_BODY;
    await expect(
      part1PutHandler(makeEvent({ body: bodyWithoutMake })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when model is missing", async () => {
    const { model: _model, ...bodyWithoutModel } = VALID_BODY;
    await expect(
      part1PutHandler(makeEvent({ body: bodyWithoutModel })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when fuelType is not a valid enum value", async () => {
    await expect(
      part1PutHandler(makeEvent({ body: { ...VALID_BODY, fuelType: "Gas" } })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when body contains unknown extra keys (strict object)", async () => {
    await expect(
      part1PutHandler(
        makeEvent({ body: { ...VALID_BODY, unknownField: true } }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── Numeric field validation ─────────────────────────────────────────────

  it("throws 400 when yearOfProduction is before 1886", async () => {
    await expect(
      part1PutHandler(
        makeEvent({ body: { ...VALID_BODY, yearOfProduction: 1885 } }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when price has more than 2 decimal places", async () => {
    await expect(
      part1PutHandler(makeEvent({ body: { ...VALID_BODY, price: 10000.999 } })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts price with exactly 2 decimal places", async () => {
    setupSuccessfulSave();
    await expect(
      part1PutHandler(makeEvent({ body: { ...VALID_BODY, price: 25000.99 } })),
    ).resolves.toBeDefined();
  });

  it("throws 400 when mileage is negative", async () => {
    await expect(
      part1PutHandler(makeEvent({ body: { ...VALID_BODY, mileage: -1 } })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── VIN validation ──────────────────────────────────────────────────────

  it("throws 400 when vinNumber is not exactly 17 characters", async () => {
    await expect(
      part1PutHandler(
        makeEvent({ body: { ...VALID_BODY, vinNumber: "SHORT" } }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when vinNumber contains invalid characters (I, O, Q)", async () => {
    await expect(
      part1PutHandler(
        makeEvent({
          body: { ...VALID_BODY, vinNumber: "1HGCM82633A00000I" },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts a valid 17-character VIN", async () => {
    setupSuccessfulSave();
    await expect(
      part1PutHandler(
        makeEvent({
          body: { ...VALID_BODY, vinNumber: "1HGCM82633A004352" },
        }),
      ),
    ).resolves.toBeDefined();
  });

  // ── Registration number validation ──────────────────────────────────────

  it("normalizes registrationNumber to uppercase", async () => {
    setupSuccessfulSave();

    const response = await part1PutHandler(
      makeEvent({ body: { ...VALID_BODY, registrationNumber: "wx12345" } }),
    );
    expect(
      (response as { data: { part1: { registrationNumber: string } } }).data
        .part1.registrationNumber,
    ).toBe("WX12345");
  });

  it("throws 400 when registrationNumber contains invalid characters", async () => {
    await expect(
      part1PutHandler(
        makeEvent({
          body: { ...VALID_BODY, registrationNumber: "WX!@#45" },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── Route param validation ───────────────────────────────────────────────

  it("throws 400 when inspectionId is not a valid UUID", async () => {
    await expect(
      part1PutHandler(makeEvent({ inspectionId: "not-a-uuid" })),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // ── 404 Not Found ────────────────────────────────────────────────────────

  it("throws 404 when inspection does not exist (fetch returns null)", async () => {
    setupFetchNotFound();
    await expect(
      part1PutHandler(makeEvent({ body: VALID_BODY })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 404 when RPC returns NOT_FOUND error", async () => {
    setupRpcNotFound();
    await expect(
      part1PutHandler(makeEvent({ body: VALID_BODY })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // ── 500 Internal Server Error ────────────────────────────────────────────

  it("throws 500 when the initial fetch fails with a DB error", async () => {
    setupFetchError();
    await expect(
      part1PutHandler(makeEvent({ body: VALID_BODY })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it("throws 500 when the RPC fails with an unexpected error", async () => {
    setupRpcError();
    await expect(
      part1PutHandler(makeEvent({ body: VALID_BODY })),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  // ── 401 Unauthorized ────────────────────────────────────────────────────

  it("throws 401 when no active session exists", async () => {
    vi.mocked(serverSupabaseUser).mockResolvedValue(null);
    await expect(
      part1PutHandler(makeEvent({ body: VALID_BODY })),
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
