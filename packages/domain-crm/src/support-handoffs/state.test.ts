import { describe, expect, it } from 'vitest';

import {
  STAFF_OWNED_STATES,
  canAcceptMemberReplyForSupportHandoffState,
  canStaffFollowUpSupportHandoffState,
  deriveSupportHandoffCrmState,
  getAllowedSupportHandoffTransitions,
  hasSupportHandoffCurrentCycleMemberReply,
  hasSupportHandoffStaffFollowedUpAfterMemberReply,
  isStaffOwnedSupportHandoffState,
  isTerminalSupportHandoffState,
  resolveSupportHandoffTransition,
} from './state';
import type { SupportHandoffStateSnapshot } from './types';

function snapshot(overrides: Partial<SupportHandoffStateSnapshot>): SupportHandoffStateSnapshot {
  return {
    acceptedAt: null,
    cycle: {
      memberReplyAt: null,
      memberReplyResponseVersion: null,
      publicResponseAcknowledgedAt: null,
      publicResponseAcknowledgedVersion: null,
      publicResponseAt: null,
      publicResponseVersion: 0,
      staffFollowedUpAt: null,
      staffFollowedUpById: null,
    },
    staffId: null,
    status: 'open',
    ...overrides,
  };
}

describe('support handoff CRM state machine', () => {
  it('defines staff-owned states explicitly', () => {
    expect(STAFF_OWNED_STATES).toEqual(['member_requested', 'staff_accepted', 'member_replied']);
    expect(isStaffOwnedSupportHandoffState('member_replied')).toBe(true);
    expect(isStaffOwnedSupportHandoffState('staff_responded')).toBe(false);
    expect(isStaffOwnedSupportHandoffState('staff_followed_up')).toBe(false);
  });

  it('makes staff_followed_up terminal for the bounded one-cycle reply model', () => {
    expect(isTerminalSupportHandoffState('staff_followed_up')).toBe(true);
    expect(getAllowedSupportHandoffTransitions('staff_followed_up')).toEqual([]);
    expect(canAcceptMemberReplyForSupportHandoffState('staff_followed_up')).toBe(false);
    expect(resolveSupportHandoffTransition('staff_followed_up', 'member_replied')).toEqual({
      allowed: false,
      from: 'staff_followed_up',
      reason: 'terminal_state',
      to: 'member_replied',
    });
  });

  it('accepts a member reply only after the current staff response is acknowledged', () => {
    expect(canAcceptMemberReplyForSupportHandoffState('staff_responded')).toBe(false);
    expect(canAcceptMemberReplyForSupportHandoffState('member_acknowledged')).toBe(true);
    expect(resolveSupportHandoffTransition('member_acknowledged', 'member_replied')).toEqual({
      allowed: true,
      from: 'member_acknowledged',
      to: 'member_replied',
    });
  });

  it('allows staff follow-up only from a current member reply', () => {
    expect(canStaffFollowUpSupportHandoffState('member_replied')).toBe(true);
    expect(canStaffFollowUpSupportHandoffState('member_acknowledged')).toBe(false);
    expect(resolveSupportHandoffTransition('member_replied', 'staff_followed_up')).toEqual({
      allowed: true,
      from: 'member_replied',
      to: 'staff_followed_up',
    });
  });

  it('identifies current-cycle replies and staff follow-up by version advancement', () => {
    expect(
      hasSupportHandoffCurrentCycleMemberReply({
        memberReplyAt: '2026-05-10T10:10:00.000Z',
        memberReplyResponseVersion: 1,
        publicResponseVersion: 1,
      })
    ).toBe(true);
    expect(
      hasSupportHandoffCurrentCycleMemberReply({
        memberReplyAt: '2026-05-10T10:10:00.000Z',
        memberReplyResponseVersion: 1,
        publicResponseVersion: 2,
      })
    ).toBe(false);
    expect(
      hasSupportHandoffStaffFollowedUpAfterMemberReply({
        memberReplyAt: '2026-05-10T10:10:00.000Z',
        memberReplyResponseVersion: 1,
        publicResponseVersion: 2,
      })
    ).toBe(true);
  });

  it('rejects unsupported and same-state transitions with stable reasons', () => {
    expect(resolveSupportHandoffTransition('member_requested', 'member_replied')).toEqual({
      allowed: false,
      from: 'member_requested',
      reason: 'unsupported_transition',
      to: 'member_replied',
    });
    expect(resolveSupportHandoffTransition('staff_accepted', 'staff_accepted')).toEqual({
      allowed: false,
      from: 'staff_accepted',
      reason: 'same_state',
      to: 'staff_accepted',
    });
  });

  it('derives the current CRM state from handoff aggregate fields', () => {
    expect(deriveSupportHandoffCrmState(snapshot({}))).toBe('member_requested');
    expect(deriveSupportHandoffCrmState(snapshot({ staffId: 'staff-1', status: 'accepted' }))).toBe(
      'staff_accepted'
    );
    expect(
      deriveSupportHandoffCrmState(
        snapshot({
          cycle: {
            ...snapshot({}).cycle,
            publicResponseAt: '2026-05-10T10:00:00.000Z',
            publicResponseVersion: 1,
          },
          status: 'accepted',
        })
      )
    ).toBe('staff_responded');
    expect(
      deriveSupportHandoffCrmState(
        snapshot({
          cycle: {
            ...snapshot({}).cycle,
            publicResponseAcknowledgedAt: '2026-05-10T10:05:00.000Z',
            publicResponseAcknowledgedVersion: 1,
            publicResponseAt: '2026-05-10T10:00:00.000Z',
            publicResponseVersion: 1,
          },
          status: 'accepted',
        })
      )
    ).toBe('member_acknowledged');
    expect(
      deriveSupportHandoffCrmState(
        snapshot({
          cycle: {
            ...snapshot({}).cycle,
            memberReplyAt: '2026-05-10T10:10:00.000Z',
            memberReplyResponseVersion: 1,
            publicResponseAcknowledgedAt: '2026-05-10T10:05:00.000Z',
            publicResponseAcknowledgedVersion: 1,
            publicResponseAt: '2026-05-10T10:00:00.000Z',
            publicResponseVersion: 1,
          },
          status: 'accepted',
        })
      )
    ).toBe('member_replied');
  });

  it('derives terminal staff follow-up and closed states ahead of reply-cycle inputs', () => {
    expect(
      deriveSupportHandoffCrmState(
        snapshot({
          cycle: {
            ...snapshot({}).cycle,
            memberReplyAt: '2026-05-10T10:10:00.000Z',
            memberReplyResponseVersion: 1,
            publicResponseVersion: 1,
            staffFollowedUpAt: '2026-05-10T10:20:00.000Z',
            staffFollowedUpById: 'staff-1',
          },
          status: 'accepted',
        })
      )
    ).toBe('staff_followed_up');
    expect(
      deriveSupportHandoffCrmState(
        snapshot({
          cycle: {
            ...snapshot({}).cycle,
            memberReplyAt: '2026-05-10T10:10:00.000Z',
            memberReplyResponseVersion: 1,
            publicResponseAt: '2026-05-10T10:20:00.000Z',
            publicResponseVersion: 2,
          },
          status: 'accepted',
        })
      )
    ).toBe('staff_followed_up');
    expect(
      deriveSupportHandoffCrmState(
        snapshot({
          cycle: {
            ...snapshot({}).cycle,
            staffFollowedUpAt: '2026-05-10T10:20:00.000Z',
          },
          status: 'closed',
        })
      )
    ).toBe('closed');
  });
});
