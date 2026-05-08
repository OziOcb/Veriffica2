import { z } from "zod";
import { ApiMetaSchema } from "./current-user";

// ── Domain schemas ─────────────────────────────────────────────────────────

export const ThemeSchema = z.enum(["system", "light", "dark"]);

export const FontScaleSchema = z.enum(["small", "medium", "large"]);

export const PatchCurrentUserPreferencesCommandSchema = z
  .strictObject({
    theme: ThemeSchema.optional(),
    fontScale: FontScaleSchema.optional(),
    hideInspectionIntro: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.theme !== undefined ||
      value.fontScale !== undefined ||
      value.hideInspectionIntro !== undefined,
    {
      message: "At least one preference field must be provided.",
    },
  );

export const UserPreferencesSchema = z.object({
  userId: z.string().uuid(),
  theme: ThemeSchema,
  fontScale: FontScaleSchema,
  hideInspectionIntro: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PatchCurrentUserPreferencesResultSchema = z.object({
  userId: z.string().uuid(),
  theme: ThemeSchema,
  fontScale: FontScaleSchema,
  hideInspectionIntro: z.boolean(),
  updatedAt: z.string(),
});

// ── Response envelope ──────────────────────────────────────────────────────

export const GetCurrentUserPreferencesResponseSchema = z.object({
  data: UserPreferencesSchema,
  meta: ApiMetaSchema,
});

export const PatchCurrentUserPreferencesResponseSchema = z.object({
  data: PatchCurrentUserPreferencesResultSchema,
  meta: ApiMetaSchema,
});

// ── Inferred types ─────────────────────────────────────────────────────────
// Derived from schemas — do not maintain these by hand.

export type PatchCurrentUserPreferencesCommand = z.infer<
  typeof PatchCurrentUserPreferencesCommandSchema
>;
export type PatchCurrentUserPreferencesResult = z.infer<
  typeof PatchCurrentUserPreferencesResultSchema
>;
export type PatchCurrentUserPreferencesResponse = z.infer<
  typeof PatchCurrentUserPreferencesResponseSchema
>;

export type GetCurrentUserPreferencesResponse = z.infer<
  typeof GetCurrentUserPreferencesResponseSchema
>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type FontScale = z.infer<typeof FontScaleSchema>;
