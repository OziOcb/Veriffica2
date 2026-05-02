import { z } from "zod";
import { ApiMetaSchema } from "./current-user";

// ── Request ────────────────────────────────────────────────────────────────

/**
 * Body sent by the client to confirm an intentional, irreversible account
 * deletion. The `confirmation` literal acts as a server-side safety gate and
 * must be validated independently of any UI-level check.
 */
export const DeleteCurrentUserCommandSchema = z.strictObject({
  confirmation: z.literal("DELETE_MY_ACCOUNT"),
});

// ── Result (data payload inside the envelope) ──────────────────────────────

export const DeleteCurrentUserResultSchema = z.object({
  /** True when auth.users row was successfully hard-deleted. */
  deleted: z.literal(true),
  /**
   * True when the server has cleared the Supabase SSR session cookies so the
   * client no longer holds a valid session after the response.
   */
  signedOut: z.boolean(),
});

// ── Response envelope ──────────────────────────────────────────────────────

export const DeleteCurrentUserResponseSchema = z.object({
  data: DeleteCurrentUserResultSchema,
  meta: ApiMetaSchema,
});

// ── Inferred types ─────────────────────────────────────────────────────────
// Derived from schemas — do not maintain these by hand.

export type DeleteCurrentUserCommand = z.infer<
  typeof DeleteCurrentUserCommandSchema
>;
export type DeleteCurrentUserResult = z.infer<
  typeof DeleteCurrentUserResultSchema
>;
export type DeleteCurrentUserResponse = z.infer<
  typeof DeleteCurrentUserResponseSchema
>;
