import { createError } from "h3";
import type { H3Event } from "h3";
import { serverSupabaseServiceRole } from "#supabase/server";
import type { ReopenInspectionCommand } from "../../../shared/contracts/inspections";

// ── RPC row types ──────────────────────────────────────────────────────────

interface ReopenRpcRow {
  snapshot_version: number;
}

// ── Domain error helpers ───────────────────────────────────────────────────

function isNotFoundError(error: unknown): boolean {
  const msg = (error as { message?: string })?.message ?? "";
  const hint = (error as { hint?: string })?.hint ?? "";
  return msg.includes("NOT_FOUND") || hint.includes("NOT_FOUND");
}

function isSnapshotConflictError(error: unknown): boolean {
  const msg = (error as { message?: string })?.message ?? "";
  const hint = (error as { hint?: string })?.hint ?? "";
  return (
    msg.includes("SNAPSHOT_CONFLICT") || hint.includes("SNAPSHOT_CONFLICT")
  );
}

function isInvalidStateError(error: unknown): boolean {
  const msg = (error as { message?: string })?.message ?? "";
  const hint = (error as { hint?: string })?.hint ?? "";
  return msg.includes("INVALID_STATE") || hint.includes("INVALID_STATE");
}

// ── Result type ────────────────────────────────────────────────────────────

export interface ReopenInspectionServiceResult {
  inspectionId: string;
  snapshotVersion: number;
}

// ── Service ────────────────────────────────────────────────────────────────

/**
 * Transitions an inspection from `completed` back to `draft` atomically.
 *
 * The SQL function `public.reopen_inspection` holds an advisory lock,
 * re-verifies ownership, snapshot_version, and status before writing.
 *
 * Error mapping:
 * - `NOT_FOUND`        → 404 Not Found
 * - `SNAPSHOT_CONFLICT`→ 409 Conflict
 * - `INVALID_STATE`    → 409 Conflict (already draft — not an invalid client
 *                         request, but a concurrent state-transition race)
 * - unexpected errors  → 500 Internal Server Error
 *
 * NOTE: RLS is disabled on public.inspections; ownership is enforced by the
 * SQL function via explicit user_id filter + advisory lock.
 */
export async function reopenInspection(
  event: H3Event,
  userId: string,
  inspectionId: string,
  command: ReopenInspectionCommand,
  requestId: string,
): Promise<ReopenInspectionServiceResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = serverSupabaseServiceRole(event) as any;

  const { data: rpcData, error: rpcError } = await client.rpc(
    "reopen_inspection",
    {
      p_user_id: userId,
      p_inspection_id: inspectionId,
      p_base_snapshot_version: command.baseSnapshotVersion,
    },
  );

  if (rpcError) {
    if (isNotFoundError(rpcError)) {
      throw createError({
        statusCode: 404,
        statusMessage: "Not Found",
        message: "The requested inspection was not found.",
      });
    }

    if (isSnapshotConflictError(rpcError)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Conflict",
        data: { code: "SNAPSHOT_CONFLICT" },
        message:
          "The snapshot version is outdated. Refresh the inspection and retry.",
      });
    }

    if (isInvalidStateError(rpcError)) {
      throw createError({
        statusCode: 409,
        statusMessage: "Conflict",
        data: { code: "INVALID_STATE" },
        message:
          "The inspection cannot be reopened in its current state. Only completed inspections can be reopened.",
      });
    }

    console.error("[reopen-inspection] RPC call failed", {
      endpoint: "POST /api/v1/inspections/:inspectionId/reopen",
      requestId,
      userId,
      inspectionId,
      errorMessage: rpcError.message,
      errorCode: rpcError.code,
    });

    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while reopening the inspection.",
    });
  }

  const rows = Array.isArray(rpcData) ? rpcData : [];
  const row = rows[0] as ReopenRpcRow | undefined;

  if (!row) {
    console.error("[reopen-inspection] RPC returned no rows", {
      endpoint: "POST /api/v1/inspections/:inspectionId/reopen",
      requestId,
      userId,
      inspectionId,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Server Error",
      message: "An unexpected error occurred while reopening the inspection.",
    });
  }

  console.info("[reopen-inspection] inspection reopened", {
    endpoint: "POST /api/v1/inspections/:inspectionId/reopen",
    requestId,
    userId,
    inspectionId,
    newSnapshotVersion: row.snapshot_version,
  });

  return {
    inspectionId,
    snapshotVersion: row.snapshot_version,
  };
}
