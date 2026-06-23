import { NON_BLOCKING_RECOVERY_LIFECYCLE_STATES } from './types';

import type { RecoveryLifecycleState } from './types';

const ISO_COUNTRY_CODE = /^[A-Z]{2}$/u;

export function hasEvidenceText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!hasEvidenceText(value)) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return ISO_COUNTRY_CODE.test(normalized) ? normalized : null;
}

export function isActiveRecoveryLifecycleState(state: RecoveryLifecycleState): boolean {
  if (state === null) {
    return false;
  }
  return !NON_BLOCKING_RECOVERY_LIFECYCLE_STATES.includes(
    state as (typeof NON_BLOCKING_RECOVERY_LIFECYCLE_STATES)[number]
  );
}
