import type { Json, Tables } from "./db/database.types";

type ProfileRow = Tables<"profiles">;
type UserPreferencesRow = Tables<"user_preferences">;
type InspectionRow = Tables<"inspections">;

type ConstrainDbEnum<TColumn, TLiteral extends string> = Extract<
  NonNullable<TColumn>,
  string
> &
  TLiteral;

type InspectionSnapshotJson = InspectionRow["snapshot"];
type InspectionSnapshotObject = Extract<
  InspectionSnapshotJson,
  { [key: string]: Json | undefined }
>;
type InspectionSnapshotText = Extract<InspectionSnapshotJson, string>;

type UserPreferenceColumns = Pick<
  UserPreferencesRow,
  | "user_id"
  | "theme"
  | "font_scale"
  | "hide_inspection_intro"
  | "created_at"
  | "updated_at"
>;

type InspectionIdentityColumns = Pick<
  InspectionRow,
  | "id"
  | "title"
  | "status"
  | "question_bank_version"
  | "snapshot_schema_version"
  | "snapshot_version"
  | "client_updated_at"
  | "created_at"
  | "updated_at"
  | "completed_at"
>;

type InspectionPart1ProjectionColumns = Pick<
  InspectionRow,
  | "price"
  | "make"
  | "model"
  | "year_of_production"
  | "registration_number"
  | "vin_number"
  | "mileage"
  | "fuel_type"
  | "transmission"
  | "drive"
  | "color"
  | "body_type"
  | "number_of_doors"
  | "address"
>;

// Utility used by PATCH-like command models to require at least one mutable field.
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Omit<
  T,
  Keys
> &
  {
    [Key in Keys]-?: Required<Pick<T, Key>> &
      Partial<Pick<T, Exclude<Keys, Key>>>;
  }[Keys];

export type UserId = ProfileRow["user_id"];
export type InspectionId = InspectionRow["id"];
export type IsoTimestampString = ProfileRow["created_at"];
export type RequestId = string;
export type Cursor = string;

export type Theme = ConstrainDbEnum<
  UserPreferenceColumns["theme"],
  "system" | "light" | "dark"
>;

export type FontScale = ConstrainDbEnum<
  UserPreferenceColumns["font_scale"],
  "small" | "medium" | "large"
>;

export type InspectionStatus = ConstrainDbEnum<
  InspectionIdentityColumns["status"],
  "draft" | "completed"
>;

export type FuelType = ConstrainDbEnum<
  InspectionPart1ProjectionColumns["fuel_type"],
  "Petrol" | "Diesel" | "Hybrid" | "Electric"
>;

export type TransmissionType = ConstrainDbEnum<
  InspectionPart1ProjectionColumns["transmission"],
  "Manual" | "Automatic"
>;

export type DriveType = ConstrainDbEnum<
  InspectionPart1ProjectionColumns["drive"],
  "2WD" | "4WD"
>;

export type BodyType = ConstrainDbEnum<
  InspectionPart1ProjectionColumns["body_type"],
  | "Sedan"
  | "Hatchback"
  | "SUV"
  | "Coupe"
  | "Convertible"
  | "Van"
  | "Pickup"
  | "Other"
>;

export type InspectionMode = "editable" | "report";
export type InspectionSort =
  | "updated_at.desc"
  | "created_at.desc"
  | "title.asc";
export type InspectionPartId = "part1" | "part2" | "part3" | "part4" | "part5";
export type InspectionQuestionPartId = Exclude<InspectionPartId, "part1">;
export type InspectionAnswerValue = "yes" | "no" | "dont_know";
export type RuntimeFlagName =
  | "chargingPortEquipped"
  | "evBatteryDocsAvailable"
  | "turboEquipped"
  | "mechanicalCompressorEquipped"
  | "importedFromEU";
export type QuestionId = `q_${string}`;
export type QuestionGroupId = string;
export type ExplanationRef = `exp_${string}`;
export type QuestionExpansion = "explanations" | "answers" | "notes";
export type InspectionDetailExpansion = "summary" | "questions-meta";
export type InspectionSummaryExpansion = "questions" | "notes";
export type RuntimeFlagsPatchMode = "preview" | "apply";
export type SyncStrategy = "client_wins";

export type SnapshotVersion = InspectionIdentityColumns["snapshot_version"];
export type QuestionBankVersion =
  InspectionIdentityColumns["question_bank_version"];
export type SnapshotSchemaVersion =
  InspectionIdentityColumns["snapshot_schema_version"];

export interface ApiMetaDto {
  requestId: RequestId;
  timestamp: IsoTimestampString;
}

export interface ApiPaginationDto {
  limit: number;
  nextCursor: Cursor | null;
  hasMore: boolean;
}

export interface ApiFieldErrorDetailDto {
  field: string;
  message: string;
}

export interface ApiErrorDto<TCode extends string = string> {
  code: TCode;
  message: string;
  details?: ApiFieldErrorDetailDto[];
}

export interface ApiSuccessResponseDto<TData> {
  data: TData;
  meta: ApiMetaDto;
}

export interface ApiListResponseDto<TData> {
  data: TData[];
  meta: ApiMetaDto & {
    pagination: ApiPaginationDto;
  };
}

// Some error responses, such as sync conflicts, also carry canonical data.
export interface ApiErrorResponseDto<
  TCode extends string = string,
  TData = unknown,
> {
  error: ApiErrorDto<TCode>;
  meta: ApiMetaDto;
  data?: TData;
}

export interface AuthenticatedUserDto {
  id: UserId;
  // Email is sourced from Supabase Auth, not from the public schema tables.
  email: string;
  createdAt: IsoTimestampString;
}

export interface ProfileDto {
  userId: ProfileRow["user_id"];
  createdAt: ProfileRow["created_at"];
  updatedAt: ProfileRow["updated_at"];
}

export interface CurrentUserAccountDto {
  user: AuthenticatedUserDto;
  profile: ProfileDto;
}

export interface DeleteCurrentUserCommand {
  confirmation: "DELETE_MY_ACCOUNT";
}

export interface DeleteCurrentUserResultDto {
  deleted: true;
  signedOut: boolean;
}

export interface UserPreferencesDto {
  userId: UserPreferenceColumns["user_id"];
  theme: Theme;
  fontScale: FontScale;
  hideInspectionIntro: UserPreferenceColumns["hide_inspection_intro"];
  createdAt: UserPreferenceColumns["created_at"];
  updatedAt: UserPreferenceColumns["updated_at"];
}

export type PatchCurrentUserPreferencesCommand = RequireAtLeastOne<{
  theme?: Theme;
  fontScale?: FontScale;
  hideInspectionIntro?: UserPreferenceColumns["hide_inspection_intro"];
}>;

export interface InspectionRouteParams {
  inspectionId: InspectionId;
}

export interface InspectionQuestionRouteParams extends InspectionRouteParams {
  questionId: QuestionId;
}

export interface InspectionPartRouteParams extends InspectionRouteParams {
  partId: InspectionQuestionPartId;
}

export interface ListInspectionsQuery {
  status?: InspectionStatus;
  sort?: InspectionSort;
  limit?: number;
  cursor?: Cursor | null;
}

export interface GetInspectionDetailQuery {
  include?: InspectionDetailExpansion[];
}

export interface PutInspectionPart1Query {
  dryRun?: boolean;
}

export interface PatchInspectionRuntimeFlagsQuery {
  mode?: RuntimeFlagsPatchMode;
}

export interface GetInspectionPartQuestionsQuery {
  include?: QuestionExpansion[];
}

export interface GetInspectionSummaryQuery {
  include?: InspectionSummaryExpansion[];
}

export interface PostInspectionSyncQuery {
  strategy?: SyncStrategy;
}

export interface InspectionScoreDistributionDto {
  yes: number;
  no: number;
  dontKnow: number;
}

export interface InspectionProgressDto {
  answeredQuestions: number;
  visibleQuestions: number;
  completionRate: number;
}

export interface InspectionPartProgressDto extends InspectionProgressDto {
  part: InspectionQuestionPartId;
  completed: boolean;
}

export type InspectionDetailedProgressDto = InspectionProgressDto & {
  parts: InspectionPartProgressDto[];
};

export interface InspectionPartStateDto {
  part: InspectionPartId;
  enabled: boolean;
  completed: boolean;
}

export interface InspectionRuntimeFlagsDto {
  chargingPortEquipped: boolean;
  evBatteryDocsAvailable: boolean;
  turboEquipped: boolean;
  mechanicalCompressorEquipped: boolean;
  importedFromEU: boolean;
}

// This DTO mirrors the validated relational projection columns plus the notes field stored only in snapshot JSON.
export interface InspectionPart1Dto {
  price: InspectionPart1ProjectionColumns["price"];
  make: NonNullable<InspectionPart1ProjectionColumns["make"]>;
  model: NonNullable<InspectionPart1ProjectionColumns["model"]>;
  yearOfProduction: InspectionPart1ProjectionColumns["year_of_production"];
  registrationNumber: InspectionPart1ProjectionColumns["registration_number"];
  vinNumber: InspectionPart1ProjectionColumns["vin_number"];
  mileage: InspectionPart1ProjectionColumns["mileage"];
  fuelType: FuelType;
  transmission: TransmissionType;
  drive: DriveType;
  color: InspectionPart1ProjectionColumns["color"];
  bodyType: BodyType;
  numberOfDoors: InspectionPart1ProjectionColumns["number_of_doors"];
  address: InspectionPart1ProjectionColumns["address"];
  notes: InspectionSnapshotText;
}

export type InspectionAnswersDto = Partial<
  Record<QuestionId, InspectionAnswerValue>
>;
export type InspectionQuestionNotesDto = Partial<
  Record<QuestionId, InspectionSnapshotText>
>;

// The canonical snapshot lives in public.inspections.snapshot; this type exposes the server-owned JSON shape in API form.
export type InspectionSnapshotDto = InspectionSnapshotObject & {
  part1: InspectionPart1Dto | null;
  runtimeFlags: InspectionRuntimeFlagsDto;
  answers: InspectionAnswersDto;
  questionNotes: InspectionQuestionNotesDto;
  globalNotes: InspectionSnapshotText;
  visibleGroupIds: QuestionGroupId[];
  visibleQuestionIds: QuestionId[];
};

export interface InspectionRecordDto {
  id: InspectionIdentityColumns["id"];
  title: InspectionIdentityColumns["title"];
  status: InspectionStatus;
  questionBankVersion: InspectionIdentityColumns["question_bank_version"];
  snapshotSchemaVersion: InspectionIdentityColumns["snapshot_schema_version"];
  snapshotVersion: InspectionIdentityColumns["snapshot_version"];
  clientUpdatedAt: InspectionIdentityColumns["client_updated_at"];
  createdAt: InspectionIdentityColumns["created_at"];
  updatedAt: InspectionIdentityColumns["updated_at"];
  completedAt: InspectionIdentityColumns["completed_at"];
}

export type InspectionCanonicalDto = InspectionRecordDto &
  InspectionSnapshotDto & {
    progress: InspectionProgressDto;
    scoreDistribution: InspectionScoreDistributionDto;
    mode: InspectionMode;
  };

export interface InspectionLimitsDto {
  maxInspections: number;
  currentInspections: number;
  remaining: number;
}

export interface InspectionListItemDto {
  id: InspectionIdentityColumns["id"];
  title: InspectionIdentityColumns["title"];
  status: InspectionStatus;
  snapshotVersion: InspectionIdentityColumns["snapshot_version"];
  updatedAt: InspectionIdentityColumns["updated_at"];
  completedAt: InspectionIdentityColumns["completed_at"];
  progress: InspectionProgressDto;
  scoreDistribution: InspectionScoreDistributionDto;
  part1Complete: boolean;
  mode: InspectionMode;
}

export type CreatedInspectionDto = Omit<
  InspectionCanonicalDto,
  "completedAt" | "part1"
> & {
  part1: null;
};

export type InspectionDetailDto = InspectionCanonicalDto & {
  parts: InspectionPartStateDto[];
  progress: InspectionDetailedProgressDto;
};

export interface SmartPruningResultDto {
  applied: boolean;
  removedAnswerIds: QuestionId[];
  removedQuestionNoteIds: QuestionId[];
}

export interface ResolvedQuestionGroupDto {
  id: QuestionGroupId;
  order: number;
  title: string;
  questionIds: QuestionId[];
}

export interface ResolvedQuestionDto {
  id: QuestionId;
  groupId: QuestionGroupId;
  order: number;
  text: string;
  allowedAnswers: InspectionAnswerValue[];
  explanationRef?: ExplanationRef;
  answer?: InspectionAnswerValue;
  questionNote?: InspectionSnapshotText;
}

export interface QuestionExplanationDto {
  title: string;
  content: string;
}

export type QuestionExplanationDictionaryDto = Partial<
  Record<ExplanationRef, QuestionExplanationDto>
>;

export interface InspectionSummaryPartDto {
  part: InspectionQuestionPartId;
  scoreDistribution: InspectionScoreDistributionDto;
}

export interface InspectionSummaryQuestionDto {
  questionId: QuestionId;
  part: InspectionQuestionPartId;
  groupId: QuestionGroupId;
  text: string;
  answer: InspectionAnswerValue;
  editable: boolean;
  questionNote?: InspectionSnapshotText;
}

export interface InspectionSummaryDto {
  inspectionId: InspectionId;
  title: InspectionIdentityColumns["title"];
  status: InspectionStatus;
  mode: InspectionMode;
  totalScoreDistribution: InspectionScoreDistributionDto;
  parts: InspectionSummaryPartDto[];
  questions?: InspectionSummaryQuestionDto[];
  progress: InspectionProgressDto;
}

export interface SyncConflictInfoDto {
  detected: boolean;
  resolvedWith: SyncStrategy;
}

export interface SyncConflictCanonicalInspectionDto {
  id: InspectionId;
  snapshotVersion: SnapshotVersion;
  clientUpdatedAt: InspectionIdentityColumns["client_updated_at"];
}

export type InspectionSyncMutationDto = RequireAtLeastOne<
  Partial<
    Pick<
      InspectionSnapshotDto,
      "part1" | "runtimeFlags" | "answers" | "questionNotes" | "globalNotes"
    >
  >
>;

export interface CreateInspectionCommand {
  clientCreatedAt: InspectionIdentityColumns["client_updated_at"];
}

export type PutInspectionPart1Command = {
  make: NonNullable<InspectionPart1ProjectionColumns["make"]>;
  model: NonNullable<InspectionPart1ProjectionColumns["model"]>;
  fuelType: FuelType;
  transmission: TransmissionType;
  drive: DriveType;
  bodyType: BodyType;
} & {
  price?: InspectionPart1ProjectionColumns["price"];
  yearOfProduction?: InspectionPart1ProjectionColumns["year_of_production"];
  registrationNumber?: InspectionPart1ProjectionColumns["registration_number"];
  vinNumber?: InspectionPart1ProjectionColumns["vin_number"];
  mileage?: InspectionPart1ProjectionColumns["mileage"];
  color?: InspectionPart1ProjectionColumns["color"];
  numberOfDoors?: InspectionPart1ProjectionColumns["number_of_doors"];
  address?: InspectionPart1ProjectionColumns["address"];
  notes?: InspectionSnapshotText;
  baseSnapshotVersion?: SnapshotVersion;
};

export type PatchInspectionRuntimeFlagsCommand = RequireAtLeastOne<
  Partial<InspectionRuntimeFlagsDto>
> & {
  baseSnapshotVersion: SnapshotVersion;
};

export interface PutInspectionAnswerCommand {
  answer: InspectionAnswerValue;
  baseSnapshotVersion: SnapshotVersion;
  clientUpdatedAt: InspectionIdentityColumns["client_updated_at"];
}

export interface PutInspectionQuestionNoteCommand {
  note: InspectionSnapshotText;
  baseSnapshotVersion: SnapshotVersion;
  clientUpdatedAt: InspectionIdentityColumns["client_updated_at"];
}

export interface PutInspectionGlobalNotesCommand {
  globalNotes: InspectionSnapshotText;
  baseSnapshotVersion: SnapshotVersion;
  clientUpdatedAt: InspectionIdentityColumns["client_updated_at"];
}

export interface DeleteInspectionCommand {
  confirmation: "DELETE_INSPECTION";
}

export interface FinalizeInspectionCommand {
  confirmation: "FINALIZE_INSPECTION";
  baseSnapshotVersion: SnapshotVersion;
}

export interface ReopenInspectionCommand {
  confirmation: "REOPEN_INSPECTION";
  baseSnapshotVersion: SnapshotVersion;
}

export interface SyncInspectionCommand {
  baseSnapshotVersion: SnapshotVersion;
  clientUpdatedAt: InspectionIdentityColumns["client_updated_at"];
  mutation: InspectionSyncMutationDto;
}

export type GetCurrentUserResponseDto =
  ApiSuccessResponseDto<CurrentUserAccountDto>;
export type DeleteCurrentUserResponseDto =
  ApiSuccessResponseDto<DeleteCurrentUserResultDto>;
export type GetCurrentUserPreferencesResponseDto =
  ApiSuccessResponseDto<UserPreferencesDto>;
export type PatchCurrentUserPreferencesResponseDto =
  ApiSuccessResponseDto<UserPreferencesDto>;
export type ListInspectionsResponseDto =
  ApiListResponseDto<InspectionListItemDto>;

export interface CreateInspectionResponseDataDto {
  inspection: CreatedInspectionDto;
  limits: InspectionLimitsDto;
}

export type CreateInspectionResponseDto =
  ApiSuccessResponseDto<CreateInspectionResponseDataDto>;
export type GetInspectionDetailResponseDto =
  ApiSuccessResponseDto<InspectionDetailDto>;

export interface DeleteInspectionResultDto {
  deleted: true;
  inspectionId: InspectionId;
  freedSlots: number;
}

export type DeleteInspectionResponseDto =
  ApiSuccessResponseDto<DeleteInspectionResultDto>;

export interface PutInspectionPart1ResultDto {
  inspectionId: InspectionId;
  part1: InspectionPart1Dto;
  title: InspectionIdentityColumns["title"];
  unlockedParts: InspectionQuestionPartId[];
  visibleGroupIds: QuestionGroupId[];
  visibleQuestionIds: QuestionId[];
  smartPruning: SmartPruningResultDto;
  snapshotVersion: SnapshotVersion;
  clientUpdatedAt: InspectionIdentityColumns["client_updated_at"];
}

export type PutInspectionPart1ResponseDto =
  ApiSuccessResponseDto<PutInspectionPart1ResultDto>;

export interface PatchInspectionRuntimeFlagsResultDto {
  inspectionId: InspectionId;
  runtimeFlags: InspectionRuntimeFlagsDto;
  visibleGroupIds: QuestionGroupId[];
  visibleQuestionIds: QuestionId[];
  smartPruning: SmartPruningResultDto;
  snapshotVersion: SnapshotVersion;
}

export type PatchInspectionRuntimeFlagsResponseDto =
  ApiSuccessResponseDto<PatchInspectionRuntimeFlagsResultDto>;

export interface GetInspectionPartQuestionsResultDto {
  inspectionId: InspectionId;
  part: InspectionQuestionPartId;
  questionBankVersion: QuestionBankVersion;
  groups: ResolvedQuestionGroupDto[];
  questions: ResolvedQuestionDto[];
  explanations?: QuestionExplanationDictionaryDto;
}

export type GetInspectionPartQuestionsResponseDto =
  ApiSuccessResponseDto<GetInspectionPartQuestionsResultDto>;

export interface PutInspectionAnswerResultDto {
  inspectionId: InspectionId;
  questionId: QuestionId;
  answer: InspectionAnswerValue;
  snapshotVersion: SnapshotVersion;
  progress: InspectionProgressDto;
  scoreDistribution: InspectionScoreDistributionDto;
}

export type PutInspectionAnswerResponseDto =
  ApiSuccessResponseDto<PutInspectionAnswerResultDto>;

export interface DeleteInspectionAnswerResultDto {
  inspectionId: InspectionId;
  questionId: QuestionId;
  deleted: true;
  snapshotVersion: SnapshotVersion;
  progress: InspectionProgressDto;
  scoreDistribution: InspectionScoreDistributionDto;
}

export type DeleteInspectionAnswerResponseDto =
  ApiSuccessResponseDto<DeleteInspectionAnswerResultDto>;

export interface PutInspectionQuestionNoteResultDto {
  inspectionId: InspectionId;
  questionId: QuestionId;
  questionNote: InspectionSnapshotText;
  globalNotes: InspectionSnapshotText;
  snapshotVersion: SnapshotVersion;
}

export type PutInspectionQuestionNoteResponseDto =
  ApiSuccessResponseDto<PutInspectionQuestionNoteResultDto>;

export interface DeleteInspectionQuestionNoteResultDto {
  inspectionId: InspectionId;
  questionId: QuestionId;
  deleted: true;
  snapshotVersion: SnapshotVersion;
}

export type DeleteInspectionQuestionNoteResponseDto =
  ApiSuccessResponseDto<DeleteInspectionQuestionNoteResultDto>;

export interface PutInspectionGlobalNotesResultDto {
  inspectionId: InspectionId;
  globalNotes: InspectionSnapshotText;
  snapshotVersion: SnapshotVersion;
}

export type PutInspectionGlobalNotesResponseDto =
  ApiSuccessResponseDto<PutInspectionGlobalNotesResultDto>;
export type GetInspectionSummaryResponseDto =
  ApiSuccessResponseDto<InspectionSummaryDto>;

export interface FinalizeInspectionResultDto {
  inspectionId: InspectionId;
  status: Extract<InspectionStatus, "completed">;
  completedAt: NonNullable<InspectionIdentityColumns["completed_at"]>;
  mode: Extract<InspectionMode, "report">;
  snapshotVersion: SnapshotVersion;
}

export type FinalizeInspectionResponseDto =
  ApiSuccessResponseDto<FinalizeInspectionResultDto>;

export interface ReopenInspectionResultDto {
  inspectionId: InspectionId;
  status: Extract<InspectionStatus, "draft">;
  completedAt: null;
  mode: Extract<InspectionMode, "editable">;
  snapshotVersion: SnapshotVersion;
}

export type ReopenInspectionResponseDto =
  ApiSuccessResponseDto<ReopenInspectionResultDto>;

export type SyncedInspectionDto = Pick<
  InspectionCanonicalDto,
  | "id"
  | "title"
  | "status"
  | "snapshotVersion"
  | "clientUpdatedAt"
  | "updatedAt"
  | "part1"
  | "runtimeFlags"
  | "answers"
  | "questionNotes"
  | "globalNotes"
  | "visibleGroupIds"
  | "visibleQuestionIds"
  | "progress"
  | "scoreDistribution"
  | "mode"
>;

export interface SyncInspectionResultDto {
  inspection: SyncedInspectionDto;
  conflict: SyncConflictInfoDto;
  smartPruning: SmartPruningResultDto;
}

export type SyncInspectionResponseDto =
  ApiSuccessResponseDto<SyncInspectionResultDto>;

export interface SyncInspectionConflictDataDto {
  canonicalInspection: SyncConflictCanonicalInspectionDto;
}

export type SyncInspectionConflictResponseDto = ApiErrorResponseDto<
  "SYNC_CONFLICT",
  SyncInspectionConflictDataDto
>;
