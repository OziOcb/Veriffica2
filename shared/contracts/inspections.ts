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

// ── GET /api/v1/inspections/{inspectionId} ─────────────────────────────────

export const InspectionRouteParamsSchema = z.object({
  inspectionId: z.string().uuid(),
});

export const InspectionDetailExpansionSchema = z.enum([
  "summary",
  "questions-meta",
]);

/**
 * Parses the optional `include` query param from a comma-separated string
 * into a typed array. Unknown expansion values are rejected with a ZodError
 * (mapped to 400 by the handler).
 */
export const GetInspectionDetailQuerySchema = z.object({
  include: z
    .string()
    .optional()
    .transform((val): string[] => {
      if (!val) return [];
      return val
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    })
    .pipe(z.array(InspectionDetailExpansionSchema)),
});

export const InspectionPart1Schema = z
  .object({
    price: z.number().nullable(),
    make: z.string(),
    model: z.string(),
    yearOfProduction: z.number().int().nullable(),
    registrationNumber: z.string().nullable(),
    vinNumber: z.string().nullable(),
    mileage: z.number().nullable(),
    fuelType: z.enum(["Petrol", "Diesel", "Hybrid", "Electric"]),
    transmission: z.enum(["Manual", "Automatic"]),
    drive: z.enum(["2WD", "4WD"]),
    color: z.string().nullable(),
    bodyType: z.enum([
      "Sedan",
      "Hatchback",
      "SUV",
      "Coupe",
      "Convertible",
      "Van",
      "Pickup",
      "Other",
    ]),
    numberOfDoors: z.number().int().nullable(),
    address: z.string().nullable(),
    notes: z.string(),
  })
  .nullable();

export const InspectionPartIdSchema = z.enum([
  "part1",
  "part2",
  "part3",
  "part4",
  "part5",
]);

export const InspectionQuestionPartIdSchema = z.enum([
  "part2",
  "part3",
  "part4",
  "part5",
]);

export const InspectionPartStateSchema = z.object({
  part: InspectionPartIdSchema,
  enabled: z.boolean(),
  completed: z.boolean(),
});

export const InspectionPartProgressSchema = z.object({
  part: InspectionQuestionPartIdSchema,
  answeredQuestions: z.number().int().nonnegative(),
  visibleQuestions: z.number().int().nonnegative(),
  completionRate: z.number().nonnegative(),
  completed: z.boolean(),
});

export const InspectionDetailedProgressSchema = InspectionProgressSchema.extend(
  {
    parts: z.array(InspectionPartProgressSchema),
  },
);

export const InspectionDetailSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: InspectionStatusSchema,
  questionBankVersion: z.string(),
  snapshotSchemaVersion: z.string(),
  snapshotVersion: z.number().int().positive(),
  clientUpdatedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  part1: InspectionPart1Schema,
  runtimeFlags: InspectionRuntimeFlagsSchema,
  answers: z.record(z.string(), InspectionAnswerValueSchema),
  questionNotes: z.record(z.string(), z.string()),
  globalNotes: z.string(),
  visibleGroupIds: z.array(z.string()),
  visibleQuestionIds: z.array(z.string()),
  parts: z.array(InspectionPartStateSchema),
  progress: InspectionDetailedProgressSchema,
  scoreDistribution: InspectionScoreDistributionSchema,
  mode: InspectionModeSchema,
});

export const GetInspectionDetailResponseSchema = z.object({
  data: InspectionDetailSchema,
  meta: ApiMetaSchema,
});

// ── DELETE /api/v1/inspections/{inspectionId} ──────────────────────────────

/**
 * Strict object — rejects any keys beyond `confirmation` to prevent
 * injection of unrecognized fields.
 */
export const DeleteInspectionCommandSchema = z.strictObject({
  confirmation: z.literal("DELETE_INSPECTION"),
});

export const DeleteInspectionResultSchema = z.object({
  deleted: z.literal(true),
  inspectionId: z.string().uuid(),
  freedSlots: z.literal(1),
});

export const DeleteInspectionResponseSchema = z.object({
  data: DeleteInspectionResultSchema,
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

export type InspectionDetailExpansion = z.infer<
  typeof InspectionDetailExpansionSchema
>;
export type InspectionRouteParams = z.infer<typeof InspectionRouteParamsSchema>;
export type GetInspectionDetailQuery = z.infer<
  typeof GetInspectionDetailQuerySchema
>;
export type InspectionPart1 = z.infer<typeof InspectionPart1Schema>;
export type InspectionPartState = z.infer<typeof InspectionPartStateSchema>;
export type InspectionPartProgress = z.infer<
  typeof InspectionPartProgressSchema
>;
export type InspectionDetailedProgress = z.infer<
  typeof InspectionDetailedProgressSchema
>;
export type InspectionDetail = z.infer<typeof InspectionDetailSchema>;
export type GetInspectionDetailResponse = z.infer<
  typeof GetInspectionDetailResponseSchema
>;
export type DeleteInspectionCommand = z.infer<
  typeof DeleteInspectionCommandSchema
>;
export type DeleteInspectionResult = z.infer<
  typeof DeleteInspectionResultSchema
>;
export type DeleteInspectionResponse = z.infer<
  typeof DeleteInspectionResponseSchema
>;
