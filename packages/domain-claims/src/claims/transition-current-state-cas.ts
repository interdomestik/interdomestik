import { and, claims, eq, isNull } from '@interdomestik/database';
import type { SQLWrapper } from 'drizzle-orm';

import type { TransitionCurrentState } from './transition-current-state';

export function transitionCurrentStateCas(current: TransitionCurrentState): SQLWrapper {
  if (current.authority === 'status_fallback') {
    return and(
      isNull(claims.caseLifecycleState),
      isNull(claims.recoveryLifecycleState),
      eq(claims.status, current.status)
    ) as SQLWrapper;
  }

  return and(
    eq(claims.caseLifecycleState, current.caseLifecycleState),
    eq(claims.recoveryLifecycleState, current.recoveryLifecycleState)
  ) as SQLWrapper;
}
