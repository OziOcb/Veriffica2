import { z } from "zod";

// ── Primitive building blocks ──────────────────────────────────────────────

export const ApiMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
});

// ── Domain schemas ─────────────────────────────────────────────────────────

export const AuthenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  createdAt: z.string(),
});

export const ProfileSchema = z.object({
  userId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CurrentUserAccountSchema = z.object({
  user: AuthenticatedUserSchema,
  profile: ProfileSchema,
});

// ── Response envelope ──────────────────────────────────────────────────────

export const GetCurrentUserResponseSchema = z.object({
  data: CurrentUserAccountSchema,
  meta: ApiMetaSchema,
});

// ── Inferred types ─────────────────────────────────────────────────────────
// Derived from schemas — do not maintain these by hand.

export type GetCurrentUserResponse = z.infer<
  typeof GetCurrentUserResponseSchema
>;
export type CurrentUserAccount = z.infer<typeof CurrentUserAccountSchema>;
export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
