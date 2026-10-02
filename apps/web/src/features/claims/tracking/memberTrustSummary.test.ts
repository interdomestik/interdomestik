import { describe, expect, it } from 'vitest';
import { deriveClaimSlaPhase } from '../policy';
import { buildMemberClaimTrustSummary } from './memberTrustSummary';

describe('buildMemberClaimTrustSummary', () => {
  it('marks draft and non-verification incomplete SLA states as requiring member action', () => {
    expect(
      buildMemberClaimTrustSummary({
        status: 'draft',
        slaPhase: 'not_applicable',
      }).state
    ).toBe('member_action_required');

    expect(
      buildMemberClaimTrustSummary({
        status: 'submitted',
        slaPhase: 'incomplete',
      }).state
    ).toBe('member_action_required');
  });

  it('describes verification as a neutral handling stage instead of a member task', () => {
    expect(
      buildMemberClaimTrustSummary({
        claimId: 'claim 900/v',
        status: 'verification',
        slaPhase: 'incomplete',
      })
    ).toEqual({
      state: 'verification_in_progress',
      titleKey: 'claims-tracking.tracking.assurance.title',
      bodyKey: 'claims-tracking.tracking.assurance.body.verification_in_progress',
      stateLabelKey: 'claims-tracking.tracking.assurance.state.verification_in_progress',
      supportHref: '/member/help?claimId=claim%20900%2Fv&source=member_claim_detail',
    });
  });

  it('keeps the neutral verification state for the real production SLA phase', () => {
    const slaPhase = deriveClaimSlaPhase('verification');

    expect(slaPhase).toBe('incomplete');
    expect(
      buildMemberClaimTrustSummary({
        claimId: 'claim-901',
        status: 'verification',
        slaPhase,
      }).state
    ).toBe('verification_in_progress');
  });

  it('marks active SLA stages as active handling', () => {
    expect(
      buildMemberClaimTrustSummary({
        claimId: 'claim-123',
        status: 'evaluation',
        slaPhase: 'running',
      })
    ).toEqual({
      state: 'active_handling',
      titleKey: 'claims-tracking.tracking.assurance.title',
      bodyKey: 'claims-tracking.tracking.assurance.body.active_handling',
      stateLabelKey: 'claims-tracking.tracking.assurance.state.active_handling',
      supportHref: '/member/help?claimId=claim-123&source=member_claim_detail',
    });
  });

  it('keeps the generic help route when no claim id is supplied', () => {
    expect(
      buildMemberClaimTrustSummary({
        status: 'evaluation',
        slaPhase: 'running',
      }).supportHref
    ).toBe('/member/help');
  });

  it('marks terminal outcomes as completed', () => {
    expect(
      buildMemberClaimTrustSummary({
        status: 'resolved',
        slaPhase: 'not_applicable',
      }).state
    ).toBe('completed');

    expect(
      buildMemberClaimTrustSummary({
        status: 'rejected',
        slaPhase: 'not_applicable',
      }).state
    ).toBe('completed');
  });

  it('marks non-terminal stages without a response timer as outside operational SLA', () => {
    expect(
      buildMemberClaimTrustSummary({
        status: 'court',
        slaPhase: 'not_applicable',
      }).state
    ).toBe('outside_operational_sla');
  });
});
