import type { ClaimStatus } from '@interdomestik/database/constants';

import type { CaseLifecycleState, RecoveryLifecycleState } from './lifecycle-state';
import { resolveClaimLifecycleCommandProjection } from './lifecycle-read-model';

export type TransitionCurrentReadRow = {
  lifecycleVersion: number;
  category?: string | null;
  caseLifecycleState: string | null | undefined;
  recoveryLifecycleState: string | null | undefined;
  status: string | null | undefined;
};

export type TransitionCurrentState = {
  authority?: 'lifecycle' | 'status_fallback';
  category?: string | null;
  lifecycleVersion: number;
  status: ClaimStatus;
  caseLifecycleState: CaseLifecycleState;
  recoveryLifecycleState: RecoveryLifecycleState;
};

export type InvalidTransitionCurrentState = {
  lifecycleVersion: number;
  category?: string | null;
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
      category: row.category ?? null,
      status: null,
      caseLifecycleState: row.caseLifecycleState ?? null,
      recoveryLifecycleState: row.recoveryLifecycleState ?? null,
    };
  }

  return {
    authority: projection.authority,
    category: row.category ?? null,
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
