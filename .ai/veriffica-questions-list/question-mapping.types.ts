export const PART_IDS = ["part2", "part3", "part4", "part5"] as const;
export type PartId = (typeof PART_IDS)[number];

export const VISIBILITY_AXES = [
  "base",
  "fuelType",
  "transmission",
  "drive",
  "bodyType",
] as const;
export type VisibilityAxis = (typeof VISIBILITY_AXES)[number];

export const FUEL_TYPES = ["petrol", "diesel", "hybrid", "electric"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const TRANSMISSION_TYPES = ["manual", "automatic"] as const;
export type TransmissionType = (typeof TRANSMISSION_TYPES)[number];

export const DRIVE_TYPES = ["2wd", "4wd"] as const;
export type DriveType = (typeof DRIVE_TYPES)[number];

export const BODY_TYPES = [
  "sedan",
  "hatchback",
  "suv",
  "coupe",
  "convertible",
  "van",
  "pickup",
  "other",
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const RUNTIME_FLAGS = [
  "chargingPortEquipped",
  "evBatteryDocsAvailable",
  "turboEquipped",
  "mechanicalCompressorEquipped",
  "importedFromEU",
] as const;
export type RuntimeFlag = (typeof RUNTIME_FLAGS)[number];

export const ALLOWED_ANSWERS = ["yes", "no", "dont_know"] as const;
export type AllowedAnswer = (typeof ALLOWED_ANSWERS)[number];

export interface Part1FieldValueMap {
  fuelType: FuelType;
  transmission: TransmissionType;
  drive: DriveType;
  bodyType: BodyType;
}

export type Part1Field = keyof Part1FieldValueMap;

export type VisibleWhen = {
  [Field in Part1Field]?: Array<Part1FieldValueMap[Field]>;
};

export type QuestionGroupId = `g-${string}`;
export type QuestionId = `q-${string}`;
export type ExplanationRef = `exp-${string}`;

export interface VisibilityModel {
  type: "additive-buckets";
  formula: VisibilityAxis[];
  emptyBuckets: {
    drive: DriveType[];
    bodyType: BodyType[];
  };
  runtimeFlags: RuntimeFlag[];
}

export interface QuestionGroup {
  id: QuestionGroupId;
  part: PartId;
  order: number;
  section: string;
  subsection: string | null;
  dependsOnFields: Part1Field[];
  visibleWhen: VisibleWhen;
  requiresEquipmentFlag?: RuntimeFlag;
}

export interface VerifficaQuestionMappingConfig {
  $schema?: string;
  version: number;
  sourceFile: string;
  visibilityModel: VisibilityModel;
  questionGroups: QuestionGroup[];
}

export interface QuestionItem {
  id: QuestionId;
  groupId: QuestionGroupId;
  part: PartId;
  section: string;
  subsection: string | null;
  label: string;
  order: number;
  explanationRef?: ExplanationRef;
}

export interface ExplanationEntry {
  legacyNumber: number;
  text: string;
}

export type ExplanationDictionary = Record<ExplanationRef, ExplanationEntry>;

export interface VerifficaQuestionBank {
  $schema?: string;
  version: number;
  sourceFile: string;
  allowedAnswers: AllowedAnswer[];
  questions: QuestionItem[];
  explanations: ExplanationDictionary;
}

export type RuntimeFlagState = Partial<Record<RuntimeFlag, boolean>>;

export interface QuestionVisibilityContext extends RuntimeFlagState {
  fuelType: FuelType;
  transmission: TransmissionType;
  drive: DriveType;
  bodyType: BodyType;
}

export interface VerifficaQuestionDataBundle {
  config: VerifficaQuestionMappingConfig;
  bank: VerifficaQuestionBank;
}
