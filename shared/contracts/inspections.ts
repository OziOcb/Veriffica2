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

/**
 * Non-nullable Part 1 object schema — the canonical normalized shape of a
 * saved Part 1 payload. Used both in detail/response schemas (where part1 is
 * guaranteed non-null after a successful PUT) and as a building block for the
 * nullable variant consumed by GET responses.
 */
export const InspectionPart1ObjectSchema = z.object({
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
});

/** Nullable variant — Part 1 is null until the first successful PUT. */
export const InspectionPart1Schema = InspectionPart1ObjectSchema.nullable();

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

// ── PUT /api/v1/inspections/{inspectionId}/part-1 ─────────────────────────

/**
 * Normalizes a string by trimming leading/trailing whitespace and collapsing
 * internal runs of whitespace to a single space. Applied to free-text fields
 * such as `make`, `model`, `color`, and `address`.
 */
function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export const PutInspectionPart1QuerySchema = z.object({
  /**
   * When `"true"`, validation and normalization run but no database write
   * occurs. The response shape is identical to a real PUT.
   */
  dryRun: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

/**
 * Command schema for PUT /api/v1/inspections/{inspectionId}/part-1.
 *
 * Uses `strictObject` to reject any keys beyond the declared fields.
 * String fields are normalized in-schema transforms before downstream
 * length / pattern validations run through `.pipe()`.
 * Cross-field and dynamic-range constraints are enforced in `.superRefine()`.
 */
export const PutInspectionPart1CommandSchema = z
  .strictObject({
    // ── Required fields ────────────────────────────────────────────────────
    make: z
      .string()
      .transform(collapseWhitespace)
      .pipe(
        z
          .string()
          .min(1, "Make is required.")
          .max(50, "Make must be at most 50 characters."),
      ),

    model: z
      .string()
      .transform(collapseWhitespace)
      .pipe(
        z
          .string()
          .min(1, "Model is required.")
          .max(60, "Model must be at most 60 characters."),
      ),

    fuelType: z.enum(["Petrol", "Diesel", "Hybrid", "Electric"]),

    transmission: z.enum(["Manual", "Automatic"]),

    drive: z.enum(["2WD", "4WD"]),

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

    // ── Optional nullable numeric fields ───────────────────────────────────
    /** 0–10 000 000, max 2 fraction digits. */
    price: z
      .number()
      .min(0, "Price cannot be negative.")
      .max(10_000_000, "Price exceeds the maximum allowed value.")
      .nullable()
      .optional()
      .transform((v) => v ?? null),

    /** Exactly 4 digits; dynamic upper bound enforced in superRefine. */
    yearOfProduction: z
      .number()
      .int("Year of production must be an integer.")
      .nullable()
      .optional()
      .transform((v) => v ?? null),

    /** 0–9 999 999. */
    mileage: z
      .number()
      .int("Mileage must be an integer.")
      .min(0, "Mileage cannot be negative.")
      .max(9_999_999, "Mileage exceeds the maximum allowed value.")
      .nullable()
      .optional()
      .transform((v) => v ?? null),

    /** 1–9. */
    numberOfDoors: z
      .number()
      .int("Number of doors must be an integer.")
      .min(1, "Number of doors must be at least 1.")
      .max(9, "Number of doors must be at most 9.")
      .nullable()
      .optional()
      .transform((v) => v ?? null),

    // ── Optional nullable string fields (with normalization) ───────────────
    /**
     * Normalized to uppercase with collapsed spaces.
     * After normalization: 2–15 chars matching ^[A-Z0-9 -]+$.
     */
    registrationNumber: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        if (val === null || val === undefined) return null;
        return val.trim().toUpperCase().replace(/\s+/g, " ");
      })
      .pipe(
        z
          .string()
          .min(
            2,
            "Registration number must be at least 2 characters after normalization.",
          )
          .max(15, "Registration number must be at most 15 characters.")
          .regex(
            /^[A-Z0-9 -]+$/,
            "Registration number may only contain letters A–Z, digits, spaces, and hyphens.",
          )
          .nullable(),
      ),

    /**
     * Normalized to uppercase. Must be exactly 17 chars matching
     * ^[A-HJ-NPR-Z0-9]{17}$ (VIN standard excludes I, O, Q).
     */
    vinNumber: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        if (val === null || val === undefined) return null;
        return val.toUpperCase();
      })
      .pipe(
        z
          .string()
          .length(17, "VIN must be exactly 17 characters.")
          .regex(
            /^[A-HJ-NPR-Z0-9]{17}$/,
            "VIN contains invalid characters. Letters I, O, and Q are not allowed.",
          )
          .nullable(),
      ),

    /** Trimmed and collapsed; 1–40 chars. */
    color: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        if (val === null || val === undefined) return null;
        return collapseWhitespace(val);
      })
      .pipe(
        z
          .string()
          .min(1, "Color must be at least 1 character.")
          .max(40, "Color must be at most 40 characters.")
          .nullable(),
      ),

    /** Trimmed and collapsed; 5–150 chars. */
    address: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        if (val === null || val === undefined) return null;
        return collapseWhitespace(val);
      })
      .pipe(
        z
          .string()
          .min(5, "Address must be at least 5 characters.")
          .max(150, "Address must be at most 150 characters.")
          .nullable(),
      ),

    /** Free-text notes; max 1000 chars. Defaults to empty string. */
    notes: z
      .string()
      .max(1000, "Notes must be at most 1000 characters.")
      .default(""),
  })
  .superRefine((data, ctx) => {
    // Cross-field: Electric fuel type requires Automatic transmission.
    if (data.fuelType === "Electric" && data.transmission !== "Automatic") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transmission"],
        message: "Electric cars must use Automatic transmission.",
      });
    }

    // Dynamic upper bound for yearOfProduction: current UTC year + 1.
    if (data.yearOfProduction !== null) {
      const maxYear = new Date().getUTCFullYear() + 1;
      if (data.yearOfProduction < 1886 || data.yearOfProduction > maxYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["yearOfProduction"],
          message: `Year of production must be between 1886 and ${maxYear}.`,
        });
      }
    }

    // Price: at most 2 fraction digits (e.g. 23000.999 is rejected).
    if (data.price !== null) {
      if (Math.round(data.price * 100) !== data.price * 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["price"],
          message: "Price may have at most 2 decimal places.",
        });
      }
    }
  });

export const SmartPruningResultSchema = z.object({
  /** Whether any answers or question notes were removed. */
  applied: z.boolean(),
  /** IDs of answers removed because their question became invisible. */
  removedAnswerIds: z.array(z.string()),
  /** IDs of question notes removed because their question became invisible. */
  removedQuestionNoteIds: z.array(z.string()),
});

export const PutInspectionPart1ResultSchema = z.object({
  inspectionId: z.string().uuid(),
  /** Normalized Part 1 data as persisted (or as computed in dryRun mode). */
  part1: InspectionPart1ObjectSchema,
  /** Canonical title rebuilt from normalized Part 1 fields. */
  title: z.string(),
  /** Parts that are now enabled because required Part 1 fields are present. */
  unlockedParts: z.array(InspectionQuestionPartIdSchema),
  /** Canonical visible group IDs recomputed from Part 1 + runtime flags. */
  visibleGroupIds: z.array(z.string()),
  /** Canonical visible question IDs recomputed from Part 1 + runtime flags. */
  visibleQuestionIds: z.array(z.string()),
  smartPruning: SmartPruningResultSchema,
  /** Incremented snapshot version after a real save; unchanged in dryRun. */
  snapshotVersion: z.number().int().positive(),
  /** ISO 8601 UTC timestamp — reflects the persisted client_updated_at. */
  clientUpdatedAt: z.string(),
});

export const PutInspectionPart1ResponseSchema = z.object({
  data: PutInspectionPart1ResultSchema,
  meta: ApiMetaSchema,
});

// ── PATCH /api/v1/inspections/{inspectionId}/runtime-flags ────────────────

export const RuntimeFlagsPatchModeSchema = z.enum(["preview", "apply"]);

export const PatchInspectionRuntimeFlagsQuerySchema = z.object({
  mode: RuntimeFlagsPatchModeSchema.default("apply"),
});

const _runtimeFlagFields = {
  chargingPortEquipped: z.boolean().optional(),
  evBatteryDocsAvailable: z.boolean().optional(),
  turboEquipped: z.boolean().optional(),
  mechanicalCompressorEquipped: z.boolean().optional(),
  importedFromEU: z.boolean().optional(),
} as const;

const _runtimeFlagKeys = Object.keys(_runtimeFlagFields) as Array<
  keyof typeof _runtimeFlagFields
>;

/**
 * Strict command schema for PATCH .../runtime-flags.
 *
 * - `baseSnapshotVersion` is always required (optimistic concurrency).
 * - At least one known flag field must be present (empty patch is rejected).
 * - Unknown keys are rejected by strictObject (mapped to 422 by the handler).
 */
export const PatchInspectionRuntimeFlagsCommandSchema = z
  .strictObject({
    baseSnapshotVersion: z.number().int().positive(),
    ..._runtimeFlagFields,
  })
  .superRefine((data, ctx) => {
    const hasFlag = _runtimeFlagKeys.some(
      (key) => key in data && data[key] !== undefined,
    );
    if (!hasFlag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message:
          "At least one runtime flag field must be present in the request body.",
      });
    }
  });

export const PatchInspectionRuntimeFlagsResultSchema = z.object({
  inspectionId: z.string().uuid(),
  runtimeFlags: InspectionRuntimeFlagsSchema,
  visibleGroupIds: z.array(z.string()),
  visibleQuestionIds: z.array(z.string()),
  smartPruning: SmartPruningResultSchema,
  snapshotVersion: z.number().int().positive(),
});

export const PatchInspectionRuntimeFlagsResponseSchema = z.object({
  data: PatchInspectionRuntimeFlagsResultSchema,
  meta: ApiMetaSchema,
});

// ── GET /api/v1/inspections/{inspectionId}/parts/{partId}/questions ─────────

/**
 * Route params schema for the resolved-questions endpoint.
 * Combines the inspection UUID with a part identifier limited to parts 2–5,
 * because Part 1 is a vehicle-data form — not a question checklist.
 */
export const InspectionPartRouteParamsSchema = z.object({
  inspectionId: z.string().uuid(),
  partId: InspectionQuestionPartIdSchema,
});

/** The three optional expansion tokens a client may request. */
export const QuestionExpansionSchema = z.enum([
  "explanations",
  "answers",
  "notes",
]);

/**
 * Parses the optional `include` query param from a comma-separated string
 * into a typed array of expansion tokens. Unknown tokens cause a ZodError
 * (mapped to 400 by the handler).
 */
export const GetInspectionPartQuestionsQuerySchema = z.object({
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
    .pipe(z.array(QuestionExpansionSchema)),
});

/**
 * A single visible question group with canonical order and the ordered list
 * of visible question IDs that belong to it.
 */
export const ResolvedQuestionGroupSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  questionIds: z.array(z.string()),
});

/**
 * A single resolved question card.
 * `answer` and `questionNote` appear only when the client requested the
 * corresponding `include` expansion. `explanationRef` is optional — not every
 * question has a linked explanation.
 */
export const ResolvedQuestionSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  order: z.number().int().nonnegative(),
  text: z.string(),
  allowedAnswers: z.array(z.enum(["yes", "no", "dont_know"])),
  explanationRef: z.string().optional(),
  answer: z.enum(["yes", "no", "dont_know"]).optional(),
  questionNote: z.string().optional(),
});

/** A single explanation entry linked from a question card via explanationRef. */
export const QuestionExplanationSchema = z.object({
  title: z.string(),
  content: z.string(),
});

/**
 * Dictionary of explanations keyed by explanationRef.
 * Only present when the client requested `include=explanations`, and only
 * contains refs referenced by at least one visible question.
 */
export const QuestionExplanationDictionarySchema = z.record(
  z.string(),
  QuestionExplanationSchema,
);

/**
 * Canonical result payload for the resolved-questions endpoint.
 * `explanations` is omitted when the client did not request the expansion.
 */
export const GetInspectionPartQuestionsResultSchema = z.object({
  inspectionId: z.string().uuid(),
  part: InspectionQuestionPartIdSchema,
  questionBankVersion: z.string(),
  groups: z.array(ResolvedQuestionGroupSchema),
  questions: z.array(ResolvedQuestionSchema),
  explanations: QuestionExplanationDictionarySchema.optional(),
});

export const GetInspectionPartQuestionsResponseSchema = z.object({
  data: GetInspectionPartQuestionsResultSchema,
  meta: ApiMetaSchema,
});

// ── PUT/DELETE /api/v1/inspections/{inspectionId}/answers/{questionId} ──────

/**
 * Route params schema for the answer mutation endpoints.
 * Syntactically validates that questionId follows the canonical `q_` prefix
 * convention. Semantic visibility validation happens in the service layer.
 */
export const InspectionQuestionRouteParamsSchema = z.object({
  inspectionId: z.string().uuid(),
  questionId: z
    .string()
    .regex(/^q_[a-z0-9_]+$/, "Question ID must follow the q_<id> format."),
});

/**
 * Strict command schema for PUT .../answers/{questionId}.
 * Unknown keys are rejected so the client cannot inject unrecognized fields.
 */
export const PutInspectionAnswerCommandSchema = z.strictObject({
  answer: InspectionAnswerValueSchema,
  /** Optimistic concurrency token matching the current snapshot_version. */
  baseSnapshotVersion: z.number().int().positive(),
  /** ISO 8601 UTC timestamp with explicit offset. */
  clientUpdatedAt: z.string().datetime({ offset: true }),
});

export const PutInspectionAnswerResultSchema = z.object({
  inspectionId: z.string().uuid(),
  questionId: z.string(),
  answer: InspectionAnswerValueSchema,
  /** New snapshot_version after the write; unchanged on a no-op save. */
  snapshotVersion: z.number().int().positive(),
  progress: InspectionProgressSchema,
  scoreDistribution: InspectionScoreDistributionSchema,
});

export const PutInspectionAnswerResponseSchema = z.object({
  data: PutInspectionAnswerResultSchema,
  meta: ApiMetaSchema,
});

export const DeleteInspectionAnswerResultSchema = z.object({
  inspectionId: z.string().uuid(),
  questionId: z.string(),
  deleted: z.literal(true),
  /** New snapshot_version after the delete. */
  snapshotVersion: z.number().int().positive(),
  progress: InspectionProgressSchema,
  scoreDistribution: InspectionScoreDistributionSchema,
});

export const DeleteInspectionAnswerResponseSchema = z.object({
  data: DeleteInspectionAnswerResultSchema,
  meta: ApiMetaSchema,
});

// ── PUT/DELETE /api/v1/inspections/{inspectionId}/question-notes/{questionId}

/**
 * Schema for the text of a single question note.
 * Trimmed before validation; empty string after trim is rejected — use DELETE
 * to remove a note.
 */
export const QuestionNoteTextSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(
        1,
        "Note must not be empty after trimming. Use DELETE to remove a note.",
      )
      .max(500, "Note must be at most 500 characters."),
  );

/**
 * Schema for the global notes document.
 * Allows empty string (clearing the document) but caps at 10 000 characters.
 */
export const GlobalNotesTextSchema = z
  .string()
  .max(10_000, "Global notes must be at most 10 000 characters.");

export const PutInspectionQuestionNoteCommandSchema = z.strictObject({
  note: QuestionNoteTextSchema,
  /** Optimistic concurrency token matching the current snapshot_version. */
  baseSnapshotVersion: z.number().int().positive(),
  /** ISO 8601 UTC timestamp with explicit offset. */
  clientUpdatedAt: z.string().datetime({ offset: true }),
});

export const PutInspectionQuestionNoteResultSchema = z.object({
  inspectionId: z.string().uuid(),
  questionId: z.string(),
  /** Normalised note value as persisted in snapshot.question_notes. */
  questionNote: z.string(),
  /** Canonical global_notes document after one-way mirroring. */
  globalNotes: z.string(),
  snapshotVersion: z.number().int().positive(),
});

export const PutInspectionQuestionNoteResponseSchema = z.object({
  data: PutInspectionQuestionNoteResultSchema,
  meta: ApiMetaSchema,
});

export const DeleteInspectionQuestionNoteResultSchema = z.object({
  inspectionId: z.string().uuid(),
  questionId: z.string(),
  deleted: z.literal(true),
  snapshotVersion: z.number().int().positive(),
});

export const DeleteInspectionQuestionNoteResponseSchema = z.object({
  data: DeleteInspectionQuestionNoteResultSchema,
  meta: ApiMetaSchema,
});

// ── PUT /api/v1/inspections/{inspectionId}/global-notes ────────────────────

export const PutInspectionGlobalNotesCommandSchema = z.strictObject({
  globalNotes: GlobalNotesTextSchema,
  /** Optimistic concurrency token matching the current snapshot_version. */
  baseSnapshotVersion: z.number().int().positive(),
  /** ISO 8601 UTC timestamp with explicit offset. */
  clientUpdatedAt: z.string().datetime({ offset: true }),
});

export const PutInspectionGlobalNotesResultSchema = z.object({
  inspectionId: z.string().uuid(),
  globalNotes: z.string(),
  snapshotVersion: z.number().int().positive(),
});

export const PutInspectionGlobalNotesResponseSchema = z.object({
  data: PutInspectionGlobalNotesResultSchema,
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
export type PutInspectionPart1Query = z.infer<
  typeof PutInspectionPart1QuerySchema
>;
/** Raw client input type before transforms run. */
export type PutInspectionPart1CommandInput = z.input<
  typeof PutInspectionPart1CommandSchema
>;
/** Normalized output type after transforms — shape used in service logic. */
export type PutInspectionPart1Command = z.output<
  typeof PutInspectionPart1CommandSchema
>;
export type SmartPruningResult = z.infer<typeof SmartPruningResultSchema>;
export type PutInspectionPart1Result = z.infer<
  typeof PutInspectionPart1ResultSchema
>;
export type PutInspectionPart1Response = z.infer<
  typeof PutInspectionPart1ResponseSchema
>;
export type InspectionPart1Object = z.infer<typeof InspectionPart1ObjectSchema>;

export type RuntimeFlagsPatchMode = z.infer<typeof RuntimeFlagsPatchModeSchema>;
export type PatchInspectionRuntimeFlagsQuery = z.infer<
  typeof PatchInspectionRuntimeFlagsQuerySchema
>;
/** Normalized output type — shape used in service logic. */
export type PatchInspectionRuntimeFlagsCommand = z.output<
  typeof PatchInspectionRuntimeFlagsCommandSchema
>;
export type PatchInspectionRuntimeFlagsResult = z.infer<
  typeof PatchInspectionRuntimeFlagsResultSchema
>;
export type PatchInspectionRuntimeFlagsResponse = z.infer<
  typeof PatchInspectionRuntimeFlagsResponseSchema
>;
export type InspectionPartRouteParams = z.infer<
  typeof InspectionPartRouteParamsSchema
>;
export type QuestionExpansion = z.infer<typeof QuestionExpansionSchema>;
export type GetInspectionPartQuestionsQuery = z.infer<
  typeof GetInspectionPartQuestionsQuerySchema
>;
export type ResolvedQuestionGroup = z.infer<typeof ResolvedQuestionGroupSchema>;
export type ResolvedQuestion = z.infer<typeof ResolvedQuestionSchema>;
export type QuestionExplanation = z.infer<typeof QuestionExplanationSchema>;
export type QuestionExplanationDictionary = z.infer<
  typeof QuestionExplanationDictionarySchema
>;
export type GetInspectionPartQuestionsResult = z.infer<
  typeof GetInspectionPartQuestionsResultSchema
>;
export type GetInspectionPartQuestionsResponse = z.infer<
  typeof GetInspectionPartQuestionsResponseSchema
>;

export type InspectionQuestionRouteParams = z.infer<
  typeof InspectionQuestionRouteParamsSchema
>;
/** Normalized output type after transforms — shape used in service logic. */
export type PutInspectionAnswerCommand = z.output<
  typeof PutInspectionAnswerCommandSchema
>;
export type PutInspectionAnswerResult = z.infer<
  typeof PutInspectionAnswerResultSchema
>;
export type PutInspectionAnswerResponse = z.infer<
  typeof PutInspectionAnswerResponseSchema
>;
export type DeleteInspectionAnswerResult = z.infer<
  typeof DeleteInspectionAnswerResultSchema
>;
export type DeleteInspectionAnswerResponse = z.infer<
  typeof DeleteInspectionAnswerResponseSchema
>;

/** Normalized output type after transforms — shape used in service logic. */
export type PutInspectionQuestionNoteCommand = z.output<
  typeof PutInspectionQuestionNoteCommandSchema
>;
export type PutInspectionQuestionNoteResult = z.infer<
  typeof PutInspectionQuestionNoteResultSchema
>;
export type PutInspectionQuestionNoteResponse = z.infer<
  typeof PutInspectionQuestionNoteResponseSchema
>;
export type DeleteInspectionQuestionNoteResult = z.infer<
  typeof DeleteInspectionQuestionNoteResultSchema
>;
export type DeleteInspectionQuestionNoteResponse = z.infer<
  typeof DeleteInspectionQuestionNoteResponseSchema
>;
/** Normalized output type after transforms — shape used in service logic. */
export type PutInspectionGlobalNotesCommand = z.output<
  typeof PutInspectionGlobalNotesCommandSchema
>;
export type PutInspectionGlobalNotesResult = z.infer<
  typeof PutInspectionGlobalNotesResultSchema
>;
export type PutInspectionGlobalNotesResponse = z.infer<
  typeof PutInspectionGlobalNotesResponseSchema
>;
