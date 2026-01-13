import type { ClaimStatus } from '@interdomestik/database/constants';
import { ALLOWED_TRANSITIONS } from '../../domain/claiming-rules';
import { ClaimOpsDetail, TERMINAL_STATUSES } from '../../types';

export type ActionType =
  | 'assign'
  | 'reassign'
  | 'update_status'
  | 'message_respond'
  | 'message_poke'
  | 'review_blockers'
  | 'escalate'
  | 'ack_sla'
  | 'reopen';

export interface NextAction {
  type: ActionType;
  label?: string; // If omitted, UI can use default from i18n
  isPrimary: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  disabled?: boolean;
  reason?: string;
}

export interface NextActionsResult {
  primary: NextAction | null;
  secondary: NextAction[];
  allowedTransitions: ClaimStatus[];
  showAssignment: boolean;
}

/**
 * Deterministic engine to compute the single primary next action.
 * Enforces business logic over UI heuristics.
 */
export function getNextActions(claim: ClaimOpsDetail, currentUserId: string): NextActionsResult {
  const isTerminal = TERMINAL_STATUSES.includes(claim.status);
  const isAssignedToMe = claim.assigneeId === currentUserId;
  const isUnassigned = claim.isUnassigned;
  const waitingOn = claim.waitingOn;

  // Assignment is relevant if it's a staff task (not waiting on member/system) and not terminal.
  const assignmentRelevant = claim.ownerRole === 'staff' && waitingOn !== 'member' && !isTerminal;

  let primary: NextAction | null = null;
  const secondary: NextAction[] = [];
  const allowedTransitions = ALLOWED_TRANSITIONS[claim.status] || [];

  if (isTerminal) {
    if (allowedTransitions.length > 0) {
      primary = {
        type: 'reopen',
        isPrimary: true,
        variant: 'outline',
      };
    }
  } else if (claim.hasSlaBreach) {
    // 1. SLA Breach -> Acknowledge (Top Priority)
    primary = {
      type: 'ack_sla',
      isPrimary: true,
      variant: 'destructive',
    };
    // If operational, add Assign as secondary
    if (assignmentRelevant && isUnassigned) {
      secondary.push({ type: 'assign', isPrimary: false });
    }
  } else if (claim.isStuck) {
    // 2. Stuck -> Review Blockers
    primary = {
      type: 'review_blockers',
      isPrimary: true,
      variant: 'secondary', // Orange-ish in UI if wanted, standard secondary for now
    };
    if (assignmentRelevant && isUnassigned) {
      secondary.push({ type: 'assign', isPrimary: false });
    }
    // Escalate is good here
    secondary.push({ type: 'escalate', isPrimary: false });
  } else if (assignmentRelevant && isUnassigned) {
    // 3. Unassigned Staff Task -> Assign
    primary = {
      type: 'assign',
      isPrimary: true,
      variant: 'default',
    };
  } else if (claim.ownerRole === 'member') {
    // 4. Member Owned -> Poke
    primary = {
      type: 'message_poke',
      isPrimary: true,
      variant: 'outline',
    };
  } else if (claim.ownerRole === 'staff') {
    // 5. Staff Assigned
    if (isAssignedToMe) {
      // Working: Advance or Reassign
      primary = {
        type: 'update_status',
        isPrimary: true,
        variant: 'default',
      };
      // secondary.push({ type: 'escalate', isPrimary: false });
    } else {
      // Assigned to colleague
      primary = {
        type: 'message_respond', // "Post Internal Note"
        isPrimary: true,
        variant: 'secondary',
      };
    }
  }

  // Always allow reassign if staff context and not terminal
  if (!isTerminal && claim.ownerRole === 'staff' && !isUnassigned) {
    secondary.push({ type: 'reassign', isPrimary: false, variant: 'ghost' });
  }

  // Always allow manual status update if transitions exist and it's not already the primary action
  if (!isTerminal && allowedTransitions.length > 0 && primary?.type !== 'update_status') {
    // Only add if not already in secondary (to avoid duplicates)
    if (!secondary.find(s => s.type === 'update_status')) {
      secondary.push({ type: 'update_status', isPrimary: false, variant: 'ghost' });
    }
  }

  return {
    primary,
    secondary,
    allowedTransitions,
    showAssignment: assignmentRelevant || (claim.ownerRole === 'staff' && !isTerminal),
  };
}
