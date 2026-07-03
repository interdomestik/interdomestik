import { and, claims, eq } from '@interdomestik/database';
import type { SQLWrapper } from 'drizzle-orm';

import type { TransitionCurrentState } from './transition-current-state';

export function transitionCurrentStateCas(current: TransitionCurrentState): SQLWrapper {
  return and(
    eq(claims.caseLifecycleState, current.caseLifecycleState),
    eq(claims.recoveryLifecycleState, current.recoveryLifecycleState)
  ) as SQLWrapper;
}
