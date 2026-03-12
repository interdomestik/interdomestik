export const FREE_START_CATEGORY_IDS = ['vehicle', 'property', 'injury'] as const;
export type FreeStartCategoryId = (typeof FREE_START_CATEGORY_IDS)[number];

export const FREE_START_OUTCOME_IDS = [
  'repair',
  'reimbursement',
  'compensation',
  'written_response',
] as const;
export type FreeStartOutcomeId = (typeof FREE_START_OUTCOME_IDS)[number];

export const FREE_START_VEHICLE_ISSUE_IDS = [
  'collision',
  'theft',
  'parking_damage',
  'insurer_delay',
] as const;
export const FREE_START_PROPERTY_ISSUE_IDS = [
  'water_damage',
  'storm_fire',
  'burglary',
  'landlord_dispute',
] as const;
export const FREE_START_INJURY_ISSUE_IDS = [
  'workplace_injury',
  'traffic_injury',
  'medical_negligence',
  'public_liability',
] as const;

export const FREE_START_ISSUE_IDS = [
  ...FREE_START_VEHICLE_ISSUE_IDS,
  ...FREE_START_PROPERTY_ISSUE_IDS,
  ...FREE_START_INJURY_ISSUE_IDS,
] as const;
export type FreeStartIssueId = (typeof FREE_START_ISSUE_IDS)[number];

export const FREE_START_ISSUES_BY_CATEGORY = {
  injury: FREE_START_INJURY_ISSUE_IDS,
  property: FREE_START_PROPERTY_ISSUE_IDS,
  vehicle: FREE_START_VEHICLE_ISSUE_IDS,
} satisfies Record<FreeStartCategoryId, readonly FreeStartIssueId[]>;
