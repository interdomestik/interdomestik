import type { SupportHandoffCrmState, SupportHandoffStateSnapshot } from './types';

export const STAFF_OWNED_STATES = [
  'member_requested',
  'staff_accepted',
  'member_replied',
] as const satisfies readonly SupportHandoffCrmState[];

export const SUPPORT_HANDOFF_TERMINAL_STATES = [
  'staff_followed_up',
  'closed',
] as const satisfies readonly SupportHandoffCrmState[];

export const SUPPORT_HANDOFF_ALLOWED_TRANSITIONS = {
  member_requested: ['staff_accepted', 'closed'],
  staff_accepted: ['staff_responded', 'closed'],
  staff_responded: ['member_acknowledged', 'closed'],
  member_acknowledged: ['member_replied', 'closed'],
  member_replied: ['staff_followed_up', 'closed'],
  staff_followed_up: [],
  closed: [],
} as const satisfies Record<SupportHandoffCrmState, readonly SupportHandoffCrmState[]>;

export type SupportHandoffTransitionResult =
  | { allowed: true; from: SupportHandoffCrmState; to: SupportHandoffCrmState }
  | {
      allowed: false;
      from: SupportHandoffCrmState;
      reason: 'same_state' | 'terminal_state' | 'unsupported_transition';
      to: SupportHandoffCrmState;
    };

export function getAllowedSupportHandoffTransitions(
  state: SupportHandoffCrmState
): readonly SupportHandoffCrmState[] {
  return SUPPORT_HANDOFF_ALLOWED_TRANSITIONS[state];
}

export function isTerminalSupportHandoffState(state: SupportHandoffCrmState): boolean {
  return (SUPPORT_HANDOFF_TERMINAL_STATES as readonly SupportHandoffCrmState[]).includes(state);
}

export function isStaffOwnedSupportHandoffState(state: SupportHandoffCrmState): boolean {
  return (STAFF_OWNED_STATES as readonly SupportHandoffCrmState[]).includes(state);
}

export function canTransitionSupportHandoffState(
  from: SupportHandoffCrmState,
  to: SupportHandoffCrmState
): boolean {
  return getAllowedSupportHandoffTransitions(from).includes(to);
}

export function resolveSupportHandoffTransition(
  from: SupportHandoffCrmState,
  to: SupportHandoffCrmState
): SupportHandoffTransitionResult {
  if (from === to) {
    return { allowed: false, from, reason: 'same_state', to };
  }

  if (isTerminalSupportHandoffState(from)) {
    return { allowed: false, from, reason: 'terminal_state', to };
  }

  if (!canTransitionSupportHandoffState(from, to)) {
    return { allowed: false, from, reason: 'unsupported_transition', to };
  }

  return { allowed: true, from, to };
}

export function canAcceptMemberReplyForSupportHandoffState(state: SupportHandoffCrmState): boolean {
  return canTransitionSupportHandoffState(state, 'member_replied');
}

export function canStaffFollowUpSupportHandoffState(state: SupportHandoffCrmState): boolean {
  return canTransitionSupportHandoffState(state, 'staff_followed_up');
}

export function deriveSupportHandoffCrmState(
  snapshot: SupportHandoffStateSnapshot
): SupportHandoffCrmState {
  if (snapshot.status === 'closed') {
    return 'closed';
  }

  const { cycle } = snapshot;
  if (cycle.staffFollowedUpAt) {
    return 'staff_followed_up';
  }

  const hasCurrentMemberReply =
    cycle.publicResponseVersion > 0 &&
    cycle.memberReplyAt != null &&
    cycle.memberReplyResponseVersion === cycle.publicResponseVersion;
  if (hasCurrentMemberReply) {
    return 'member_replied';
  }

  const hasCurrentAcknowledgement =
    cycle.publicResponseVersion > 0 &&
    cycle.publicResponseAcknowledgedAt != null &&
    cycle.publicResponseAcknowledgedVersion === cycle.publicResponseVersion;
  if (hasCurrentAcknowledgement) {
    return 'member_acknowledged';
  }

  if (cycle.publicResponseVersion > 0 && cycle.publicResponseAt != null) {
    return 'staff_responded';
  }

  if (snapshot.status === 'accepted' || snapshot.acceptedAt != null || snapshot.staffId != null) {
    return 'staff_accepted';
  }

  return 'member_requested';
}
