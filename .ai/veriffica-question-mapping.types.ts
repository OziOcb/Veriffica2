export type PartId = "part1" | "part2" | "part3" | "part4" | "part5";

export type ConfigPartId = Exclude<PartId, "part1">;

export type FuelType = "petrol" | "diesel" | "lpg" | "hybrid" | "electric";

export type TransmissionType = "manual" | "automatic";
export type DriveType = "2wd" | "4wd";

export type BodyType =
  | "sedan"
  | "hatchback"
  | "suv"
  | "coupe"
  | "convertible"
  | "van"
  | "pickup"
  | "other";

export type Part1FieldKey =
  | "price"
  | "make"
  | "model"
  | "year"
  | "registrationNumber"
  | "vin"
  | "mileage"
  | "fuelType"
  | "transmission"
  | "drive"
  | "color"
  | "bodyType"
  | "doorCount"
  | "address"
  | "notes";

export interface Part1VehicleConfig {
  price?: number | null;
  make: string;
  model: string;
  year: number;
  registrationNumber: string;
  vin?: string | null;
  mileage?: number | null;
  fuelType: FuelType;
  transmission: TransmissionType;
  drive: DriveType;
  color?: string | null;
  bodyType: BodyType;
  doorCount?: number | null;
  address?: string | null;
  notes?: string | null;
}

export type RuntimeFlagKey =
  | "requiredPart1Complete"
  | "combustionEnginePresent"
  | "sparkPlugsPresent"
  | "chargingPortEquipped"
  | "turboEquipped"
  | "mechanicalCompressorEquipped"
  | "evBatteryDocsAvailable";

export type RuntimeFlagType = "derived" | "runtime-confirmed";

export interface RuntimeFlagDefinition {
  type: RuntimeFlagType;
  description: string;
}

export type RuntimeFlagState = Record<RuntimeFlagKey, boolean>;

export type QuestionGroupId =
  | "p2_car_body"
  | "p2_engine_bay_base"
  | "p2_coolant_condition"
  | "p2_oil_condition"
  | "p2_spark_plugs"
  | "p2_diesel_fuel_system"
  | "p2_diesel_cold_checks"
  | "p2_lpg_installation"
  | "p2_hv_system"
  | "p2_charging_port"
  | "p2_belts_pulleys"
  | "p2_mechanical_supercharger"
  | "p2_auto_visual"
  | "p2_4wd_driveline"
  | "p2_convertible_roof"
  | "p2_suv_checks"
  | "p2_van_cargo"
  | "p2_pickup_bed"
  | "p2_front_suspension"
  | "p2_tires"
  | "p2_exhaust_condition"
  | "p2_interior_wear"
  | "p2_interior_upholstery"
  | "p2_interior_electrics"
  | "p2_steering_static"
  | "p3_ignition"
  | "p3_diesel_start"
  | "p3_ev_ready"
  | "p3_steering_interior"
  | "p3_auto_selector"
  | "p3_engine_condition"
  | "p3_exhaust"
  | "p4_manual_gearbox"
  | "p4_automatic_gearbox"
  | "p4_diesel_load"
  | "p4_suspension"
  | "p4_steering"
  | "p4_other"
  | "p4_ev_drive"
  | "p4_brakes"
  | "p4_turbo"
  | "p4_4wd_operation"
  | "p4_convertible_noise"
  | "p5_vin"
  | "p5_lpg_docs"
  | "p5_ev_docs"
  | "p5_service_booklet"
  | "p5_registration"
  | "p5_vehicle_card"
  | "p5_eu_import";

export interface FieldConditionValueMap {
  price: number | null | undefined;
  make: string;
  model: string;
  year: number;
  registrationNumber: string;
  vin: string | null | undefined;
  mileage: number | null | undefined;
  fuelType: FuelType;
  transmission: TransmissionType;
  drive: DriveType;
  color: string | null | undefined;
  bodyType: BodyType;
  doorCount: number | null | undefined;
  address: string | null | undefined;
  notes: string | null | undefined;
}

export type VisibilityOperator = "all" | "any";

export interface FlagEqualsCondition {
  flag: RuntimeFlagKey;
  equals: boolean;
}

export interface FieldEqualsCondition<K extends Part1FieldKey = Part1FieldKey> {
  field: K;
  equals: FieldConditionValueMap[K];
}

export interface FieldInCondition<K extends Part1FieldKey = Part1FieldKey> {
  field: K;
  in: ReadonlyArray<FieldConditionValueMap[K]>;
}

export interface FieldNotInCondition<K extends Part1FieldKey = Part1FieldKey> {
  field: K;
  notIn: ReadonlyArray<FieldConditionValueMap[K]>;
}

export interface CompoundCondition {
  operator: VisibilityOperator;
  conditions: VisibilityCondition[];
}

export type VisibilityCondition =
  | FlagEqualsCondition
  | FieldEqualsCondition
  | FieldInCondition
  | FieldNotInCondition
  | CompoundCondition;

export interface QuestionGroupConfig {
  id: QuestionGroupId;
  part: ConfigPartId;
  label: string;
  dependsOnFields: Part1FieldKey[];
  requiresEquipmentFlag?: RuntimeFlagKey;
  visibleWhen: CompoundCondition;
}

export interface DerivedRule {
  id: string;
  name: string;
  description: string;
}

export interface PruningConfig {
  triggerFields: Part1FieldKey[];
  mode: "remove_answers_for_now_hidden_groups";
  recalculateImmediately: boolean;
}

export type EvaluationStep =
  | "validate_required_part1_fields"
  | "set_requiredPart1Complete_flag"
  | "evaluate_group_visibility"
  | "apply_if_equipped_flags"
  | "render_only_visible_groups"
  | "prune_orphaned_answers_after_part1_changes"
  | "recalculate_progress_and_total_score";

export interface VerifficaQuestionMappingConfig {
  version: number;
  name: string;
  description: string;
  part1: {
    requiredFields: Part1FieldKey[];
    enumValues: {
      fuelType: FuelType[];
      transmission: TransmissionType[];
      drive: DriveType[];
      bodyType: BodyType[];
    };
  };
  runtimeFlags: Record<RuntimeFlagKey, RuntimeFlagDefinition>;
  questionGroups: QuestionGroupConfig[];
  derivedRules: DerivedRule[];
  pruning: PruningConfig;
  evaluationOrder: EvaluationStep[];
}

export type QuestionAnswerType = "yes-no-dont-know";
export type InspectionAnswerValue = "yes" | "no" | "dont_know";

export interface ExplanationDefinition {
  id: number;
  text: string;
}

export interface QuestionDefinition {
  id: string;
  groupId: QuestionGroupId;
  part: ConfigPartId;
  section: string;
  subsection?: string;
  label: string;
  order: number;
  explanationRef?: number | null;
  answerType?: QuestionAnswerType;
}

export interface QuestionBankFile {
  version: number;
  name: string;
  description: string;
  defaultAnswerType: QuestionAnswerType;
  explanations: ExplanationDefinition[];
  questions: QuestionDefinition[];
}

export interface InspectionAnswer {
  inspectionId: string;
  questionId: string;
  value: InspectionAnswerValue;
  updatedAt: string;
}

export interface InspectionNote {
  id: string;
  inspectionId: string;
  questionId?: string;
  questionLabel?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisibilityContext {
  vehicle: Part1VehicleConfig;
  flags: RuntimeFlagState;
}

export interface EvaluatedQuestionGroup extends QuestionGroupConfig {
  visible: boolean;
}

export interface QuestionBankIndex {
  byGroupId: Record<QuestionGroupId, QuestionDefinition[]>;
  byQuestionId: Record<string, QuestionDefinition>;
}
