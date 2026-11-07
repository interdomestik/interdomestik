export const LEAD_DUPLICATE_RESOLVED_ACTION = 'AGENT_LEAD_DUPLICATE_RESOLVED';
export const LEAD_DUPLICATE_RESOLUTION_ENTITY = 'lead_duplicate_referral';
/** The entity type the agent-side referral (ACQ-1) records. */
export const REFERRAL_ENTITY_TYPE = 'member_lead';

/** Recorded triage closure only: no merge, reassignment or submitter notification follows. */
export const DUPLICATE_RESOLUTION_OUTCOMES = ['kept_existing', 'dismissed'] as const;
export type DuplicateResolutionOutcome = (typeof DUPLICATE_RESOLUTION_OUTCOMES)[number];
