/** Notice version recorded on seeded leads; real leads carry the version the prospect accepted. */
export const SEEDED_LEAD_NOTICE_VERSION = 'seed-agent-notice-v1';

/**
 * The owning agent of a seeded lead plus the consent that agent captured, so every seeded row
 * satisfies `member_leads_consent_check` the way an agent-assisted lead from the app does.
 */
export function agentCapturedLead(agentId: string, capturedAt: Date) {
  return {
    agentId,
    consentNoticeVersion: SEEDED_LEAD_NOTICE_VERSION,
    consentCapturedAt: capturedAt,
    consentCapturedBy: agentId,
    captureChannel: 'agent_assisted' as const,
  };
}
