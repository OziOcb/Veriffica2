import { z } from "zod";
import { ApiMetaSchema } from "./current-user";

// ── Domain schemas ─────────────────────────────────────────────────────────

export const ThemeSchema = z.enum(["system", "light", "dark"]);

export const FontScaleSchema = z.enum(["small", "medium", "large"]);

export const UserPreferencesSchema = z.object({
  userId: z.string().uuid(),
  theme: ThemeSchema,
  fontScale: FontScaleSchema,
  hideInspectionIntro: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ── Response envelope ──────────────────────────────────────────────────────

export const GetCurrentUserPreferencesResponseSchema = z.object({
  data: UserPreferencesSchema,
  meta: ApiMetaSchema,
});

// ── Inferred types ─────────────────────────────────────────────────────────
// Derived from schemas — do not maintain these by hand.

export type GetCurrentUserPreferencesResponse = z.infer<
  typeof GetCurrentUserPreferencesResponseSchema
>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type FontScale = z.infer<typeof FontScaleSchema>;
