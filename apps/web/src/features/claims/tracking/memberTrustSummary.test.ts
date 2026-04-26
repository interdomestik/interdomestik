import { describe, expect, it } from 'vitest';
import { buildMemberClaimTrustSummary } from './memberTrustSummary';

describe('buildMemberClaimTrustSummary', () => {
  it('marks draft and incomplete SLA states as requiring member action', () => {
    expect(
      buildMemberClaimTrustSummary({
        status: 'draft',
        slaPhase: 'not_applicable',
      }).state
    ).toBe('member_action_required');

    expect(
      buildMemberClaimTrustSummary({
        status: 'verification',
        slaPhase: 'incomplete',
      }).state
    ).toBe('member_action_required');
  });

  it('marks active SLA stages as active handling', () => {
    expect(
      buildMemberClaimTrustSummary({
        status: 'evaluation',
        slaPhase: 'running',
      })
    ).toEqual({
      state: 'active_handling',
      titleKey: 'claims-tracking.tracking.assurance.title',
      bodyKey: 'claims-tracking.tracking.assurance.body.active_handling',
      stateLabelKey: 'claims-tracking.tracking.assurance.state.active_handling',
      supportHref: '/member/help',
    });
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
