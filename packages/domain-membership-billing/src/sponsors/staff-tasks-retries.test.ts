import { describe, expect, it, vi } from 'vitest';
import { recancellationTasks } from './staff-tasks';

type AttemptRow = Parameters<typeof recancellationTasks>[0][number];
function attempts(count = 5): AttemptRow[] {
  return Array.from({ length: count }, (_, i) => ({
    intentId: 'intent',
    userId: 'member',
    attempts: 12,
    attemptNo: i + 2,
    outcome: 'unknown',
    dispatchedAt: '2027-05-31T23:00:00Z',
  }));
}

describe('re-cancellation retry escalation', () => {
  it('uses the five newest attempt numbers, ignoring older success and row order', () => {
    const rows = [
      ...attempts(),
      { ...attempts()[0], attemptNo: 1, outcome: 'scheduled' },
    ].reverse();
    expect(recancellationTasks(rows, [])).toEqual([
      { kind: 'retrying_cancel', intentId: 'intent', userId: 'member', attempts: 12 },
    ]);
  });
  it('does not escalate four unknown attempts', () => {
    expect(recancellationTasks(attempts(4), [])).toEqual([]);
  });
  it.each(['scheduled', 'refused', 'moot'])(
    'does not escalate when the newest attempt is %s',
    outcome => {
      expect(
        recancellationTasks([...attempts(), { ...attempts()[0], attemptNo: 7, outcome }], [])
      ).toEqual([]);
    }
  );
  it('does not escalate when any of the five latest attempts has a known outcome', () => {
    const rows = attempts();
    rows[1] = { ...rows[1], outcome: 'scheduled' };
    expect(recancellationTasks(rows, [])).toEqual([]);
  });
  it('keeps escalation through an outage five days after the newest dispatch', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
      const rows = attempts().map(row => ({ ...row, dispatchedAt: '2027-05-27T00:00:00Z' }));
      expect(recancellationTasks(rows, [])).toEqual([
        { kind: 'retrying_cancel', intentId: 'intent', userId: 'member', attempts: 12 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each([6, 7])('hides escalation for a confirmation after attempt %s', afterAttempt => {
    expect(recancellationTasks(attempts(), [{ intentId: 'intent', afterAttempt }])).toEqual([]);
  });
  it('keeps escalation for an older confirmation or a different intent', () => {
    expect(
      recancellationTasks(attempts(), [
        { intentId: 'intent', afterAttempt: 5 },
        { intentId: 'other', afterAttempt: 7 },
      ])
    ).toEqual([{ kind: 'retrying_cancel', intentId: 'intent', userId: 'member', attempts: 12 }]);
  });
  it('isolates intents', () => {
    const rows = attempts().map(row => ({ ...row, dispatchedAt: '2027-05-30T00:00:00Z' }));
    expect(
      recancellationTasks([...rows, ...attempts(4).map(row => ({ ...row, intentId: 'other' }))], [])
    ).toEqual([{ kind: 'retrying_cancel', intentId: 'intent', userId: 'member', attempts: 12 }]);
  });
});
