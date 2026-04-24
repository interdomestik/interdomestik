/**
 * Claim Pack domain types.
 *
 * A ClaimPack is the output of the Free Start self-serve intake. It contains
 * a confidence score, evidence checklist, complaint letter draft, estimated
 * timeline, and a recommended next step. No claim is created in the database —
 * the pack is ephemeral until the member upgrades to Asistenca.
 */

// ---------------------------------------------------------------------------
// Claim types (aligned with commercial-launch-scope.ts)
// ---------------------------------------------------------------------------

export const CLAIM_PACK_TYPES = ['vehicle', 'property', 'injury'] as const;
export type ClaimPackType = (typeof CLAIM_PACK_TYPES)[number];

// ---------------------------------------------------------------------------
// Intake answers (per-type inputs)
// ---------------------------------------------------------------------------

export type CommonIntakeAnswers = {
  /** When the incident occurred */
  incidentDate: string;
  /** Brief description of what happened */
  description: string;
  /** Estimated monetary loss in EUR cents */
  estimatedAmount?: number;
  /** Currency code (default EUR) */
  currency?: string;
  /** Country where the incident occurred */
  incidentCountry?: string;
};

export type VehicleIntakeAnswers = CommonIntakeAnswers & {
  /** Name or identifier of the other party */
  counterpartyName?: string;
  /** Insurance company of the other party */
  counterpartyInsurer?: string;
  /** Police report filed? */
  policeReportFiled?: boolean;
  /** Have vehicle damage photos? */
  hasDamagePhotos?: boolean;
  /** Have a repair estimate? */
  hasRepairEstimate?: boolean;
};

export type PropertyIntakeAnswers = CommonIntakeAnswers & {
  /** Name or identifier of the responsible party */
  counterpartyName?: string;
  /** Type of property damage */
  damageType?: string;
  /** Have ownership proof? */
  hasOwnershipProof?: boolean;
  /** Have damage documentation? */
  hasDamagePhotos?: boolean;
  /** Have an insurance policy? */
  hasInsurancePolicy?: boolean;
};

export type InjuryIntakeAnswers = CommonIntakeAnswers & {
  /** Name or identifier of the responsible party */
  counterpartyName?: string;
  /** Have medical records? */
  hasMedicalRecords?: boolean;
  /** Have an incident report? */
  hasIncidentReport?: boolean;
  /** Have witness statements? */
  hasWitnessStatements?: boolean;
  /** Have expense receipts? */
  hasExpenseReceipts?: boolean;
};

export type IntakeAnswers = VehicleIntakeAnswers | PropertyIntakeAnswers | InjuryIntakeAnswers;

// ---------------------------------------------------------------------------
// Claim Pack Input
// ---------------------------------------------------------------------------

type ClaimPackInputBase = {
  /** BCP-47 locale for letter generation */
  locale?: string;
  /** Optional uploaded file references (not stored, just for scoring) */
  uploadedFileCount?: number;
  /** Optional deterministic generation time for tests and replayed actions */
  generatedAt?: string;
};

export type ClaimPackInput =
  | (ClaimPackInputBase & {
      claimType: 'vehicle';
      answers: VehicleIntakeAnswers;
    })
  | (ClaimPackInputBase & {
      claimType: 'property';
      answers: PropertyIntakeAnswers;
    })
  | (ClaimPackInputBase & {
      claimType: 'injury';
      answers: InjuryIntakeAnswers;
    });

// ---------------------------------------------------------------------------
// Confidence Scoring
// ---------------------------------------------------------------------------

export type ConfidenceFactor = {
  name: string;
  pointsEarned: number;
  maxPoints: number;
  explanation: string;
};

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ConfidenceResult = {
  score: number;
  level: ConfidenceLevel;
  factors: ConfidenceFactor[];
};

// ---------------------------------------------------------------------------
// Evidence Checklist
// ---------------------------------------------------------------------------

export type EvidenceItem = {
  id: string;
  name: string;
  description: string;
  required: boolean;
  /** Placeholder status for member-side evidence organization */
  status: 'provided' | 'missing';
  /** Whether the intake answers suggest this item is already available */
  likelyAvailable: boolean;
};

export type EvidenceChecklist = {
  claimType: ClaimPackType;
  items: EvidenceItem[];
  requiredCount: number;
  likelyAvailableCount: number;
};

// ---------------------------------------------------------------------------
// Letter
// ---------------------------------------------------------------------------

export type ComplaintLetter = {
  locale: string;
  body: string;
  /** Placeholders the member needs to fill in */
  placeholders: string[];
};

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type TimelineMilestone = {
  id: string;
  label: string;
  estimatedRange: string;
  description: string;
};

export type ClaimTimeline = {
  claimType: ClaimPackType;
  confidenceLevel: ConfidenceLevel;
  milestones: TimelineMilestone[];
};

// ---------------------------------------------------------------------------
// ClaimPack (the full output)
// ---------------------------------------------------------------------------

export type ClaimPack = {
  /** ISO timestamp of generation */
  generatedAt: string;
  claimType: ClaimPackType;
  /** Intake facts used to generate the pack */
  intakeAnswers: IntakeAnswers;
  confidence: ConfidenceResult;
  evidenceChecklist: EvidenceChecklist;
  letter: ComplaintLetter;
  timeline: ClaimTimeline;
  recommendedNextStep: RecommendedNextStep;
  disclaimer: string;
};

export type RecommendedNextStep = {
  level: ConfidenceLevel;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
};
