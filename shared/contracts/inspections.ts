import { z } from "zod";
import { ApiMetaSchema } from "./current-user";

// ── Primitive building blocks ──────────────────────────────────────────────

export const InspectionStatusSchema = z.enum(["draft", "completed"]);

export const InspectionSortSchema = z.enum([
  "updated_at.desc",
  "created_at.desc",
  "title.asc",
]);

export const InspectionModeSchema = z.enum(["editable", "report"]);

// ── Domain building blocks ─────────────────────────────────────────────────

export const InspectionProgressSchema = z.object({
  answeredQuestions: z.number().int().nonnegative(),
  visibleQuestions: z.number().int().nonnegative(),
  completionRate: z.number().nonnegative(),
});

export const InspectionScoreDistributionSchema = z.object({
  yes: z.number().int().nonnegative(),
  no: z.number().int().nonnegative(),
  dontKnow: z.number().int().nonnegative(),
});

/**
 * Exactly the five known runtime flag booleans. Unknown keys are stripped
 * by z.strictObject so the schema acts as an allowlist.
 */
export const InspectionRuntimeFlagsSchema = z.strictObject({
  chargingPortEquipped: z.boolean(),
  evBatteryDocsAvailable: z.boolean(),
  turboEquipped: z.boolean(),
  mechanicalCompressorEquipped: z.boolean(),
  importedFromEU: z.boolean(),
});

// ── GET /api/v1/inspections ────────────────────────────────────────────────

export const ListInspectionsQuerySchema = z.object({
  status: InspectionStatusSchema.optional(),
  sort: InspectionSortSchema.default("updated_at.desc"),
  /** Coerced from query-string; clamped server-side to 1–50. */
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const ApiPaginationSchema = z.object({
  limit: z.number().int().positive(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const InspectionListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: InspectionStatusSchema,
  snapshotVersion: z.number().int().positive(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  progress: InspectionProgressSchema,
  scoreDistribution: InspectionScoreDistributionSchema,
  part1Complete: z.boolean(),
  mode: InspectionModeSchema,
});

export const ListInspectionsResponseSchema = z.object({
  data: z.array(InspectionListItemSchema),
  meta: ApiMetaSchema.extend({
    pagination: ApiPaginationSchema,
  }),
});

// ── POST /api/v1/inspections ───────────────────────────────────────────────

/**
 * Strict object — extra keys are rejected so the client cannot inject
 * unrecognized fields.
 */
export const CreateInspectionCommandSchema = z.strictObject({
  /**
   * Client-local timestamp of the creation event. Must be a valid ISO 8601
   * date-time string with an explicit UTC offset.
   */
  clientCreatedAt: z.string().datetime({ offset: true }),
});

export const InspectionAnswerValueSchema = z.enum(["yes", "no", "dont_know"]);

/**
 * Canonical shape of a newly created inspection. Part 1 is always null at
 * creation time; answers and notes are always empty.
 */
export const CreatedInspectionSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: InspectionStatusSchema,
  questionBankVersion: z.string(),
  snapshotSchemaVersion: z.string(),
  snapshotVersion: z.number().int().positive(),
  clientUpdatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  part1: z.null(),
  runtimeFlags: InspectionRuntimeFlagsSchema,
  answers: z.record(z.string(), InspectionAnswerValueSchema),
  questionNotes: z.record(z.string(), z.string()),
  globalNotes: z.string(),
  visibleGroupIds: z.array(z.string()),
  visibleQuestionIds: z.array(z.string()),
  progress: InspectionProgressSchema,
  scoreDistribution: InspectionScoreDistributionSchema,
  mode: InspectionModeSchema,
});

export const InspectionLimitsSchema = z.object({
  maxInspections: z.number().int().positive(),
  currentInspections: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

export const CreateInspectionResponseSchema = z.object({
  data: z.object({
    inspection: CreatedInspectionSchema,
    limits: InspectionLimitsSchema,
  }),
  meta: ApiMetaSchema,
});

// ── Inferred types ─────────────────────────────────────────────────────────
// Derived from schemas — do not maintain these by hand.

export type InspectionStatus = z.infer<typeof InspectionStatusSchema>;
export type InspectionSort = z.infer<typeof InspectionSortSchema>;
export type InspectionMode = z.infer<typeof InspectionModeSchema>;
export type InspectionProgress = z.infer<typeof InspectionProgressSchema>;
export type InspectionScoreDistribution = z.infer<
  typeof InspectionScoreDistributionSchema
>;
export type InspectionRuntimeFlags = z.infer<
  typeof InspectionRuntimeFlagsSchema
>;
export type ListInspectionsQuery = z.infer<typeof ListInspectionsQuerySchema>;
export type InspectionListItem = z.infer<typeof InspectionListItemSchema>;
export type ListInspectionsResponse = z.infer<
  typeof ListInspectionsResponseSchema
>;
export type CreateInspectionCommand = z.infer<
  typeof CreateInspectionCommandSchema
>;
export type CreatedInspection = z.infer<typeof CreatedInspectionSchema>;
export type InspectionLimits = z.infer<typeof InspectionLimitsSchema>;
export type CreateInspectionResponse = z.infer<
  typeof CreateInspectionResponseSchema
>;
