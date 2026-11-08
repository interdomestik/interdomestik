import { describe, expect, it } from 'vitest';

import type { RecoveryDecisionSnapshot } from '@/actions/staff-claims.core';

import { getRecoveryDecisionLabel } from './recovery-decision-helpers';

const snapshot = (status: RecoveryDecisionSnapshot['status']) =>
  ({ status }) as RecoveryDecisionSnapshot;

describe('getRecoveryDecisionLabel', () => {
  it.each([
    ['pending', 'Entscheidung der Mitarbeitenden ausstehend'],
    ['accepted', 'Zur Durchsetzung durch Mitarbeitende angenommen'],
    ['declined', 'Zur Durchsetzung durch Mitarbeitende abgelehnt'],
  ] as const)('labels the German %s decision in German', (status, label) => {
    expect(getRecoveryDecisionLabel(snapshot(status), 'de')).toBe(label);
  });

  it('keeps English for an unsupported locale', () => {
    expect(getRecoveryDecisionLabel(snapshot('accepted'), 'hr')).toBe(
      'Accepted for staff-led recovery'
    );
  });
});
