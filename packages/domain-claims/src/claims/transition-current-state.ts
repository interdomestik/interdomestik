import type { ClaimStatus } from '@interdomestik/database/constants';

import type { CaseLifecycleState, RecoveryLifecycleState } from './lifecycle-state';
import { resolveClaimLifecycleCommandProjection } from './lifecycle-read-model';

export type TransitionCurrentReadRow = {
  lifecycleVersion: number;
  caseLifecycleState: string | null | undefined;
  recoveryLifecycleState: string | null | undefined;
};

export type TransitionCurrentState = {
  lifecycleVersion: number;
  status: ClaimStatus;
  caseLifecycleState: CaseLifecycleState;
  recoveryLifecycleState: RecoveryLifecycleState;
};

export type InvalidTransitionCurrentState = {
  lifecycleVersion: number;
  status: null;
  caseLifecycleState: string | null;
  recoveryLifecycleState: string | null;
};

export function resolveTransitionCurrentState(
  row: TransitionCurrentReadRow
): TransitionCurrentState | InvalidTransitionCurrentState {
  const projection = resolveClaimLifecycleCommandProjection(row);
  if (!projection.success) {
    return {
      lifecycleVersion: row.lifecycleVersion,
      status: null,
      caseLifecycleState: row.caseLifecycleState ?? null,
      recoveryLifecycleState: row.recoveryLifecycleState ?? null,
    };
  }

  return {
    lifecycleVersion: row.lifecycleVersion,
    caseLifecycleState: projection.caseLifecycleState,
    recoveryLifecycleState: projection.recoveryLifecycleState,
    status: projection.status,
  };
}

export function isValidTransitionCurrentState(
  current: TransitionCurrentState | InvalidTransitionCurrentState
): current is TransitionCurrentState {
  return current.status !== null;
}
