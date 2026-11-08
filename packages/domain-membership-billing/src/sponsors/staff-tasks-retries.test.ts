import { describe, expect, it } from 'vitest';
import { recancellationTasks } from './staff-tasks';

type AttemptRow = Parameters<typeof recancellationTasks>[0][number];
const now = new Date('2027-06-01T00:00:00Z');
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
    expect(recancellationTasks(rows, now)).toEqual([
      { kind: 'retrying_cancel', intentId: 'intent', userId: 'member', attempts: 12 },
    ]);
  });
  it('does not escalate four unknown attempts', () => {
    expect(recancellationTasks(attempts(4), now)).toEqual([]);
  });
  it.each(['scheduled', 'refused', 'moot'])(
    'does not escalate when the newest attempt is %s',
    outcome => {
      expect(
        recancellationTasks([...attempts(), { ...attempts()[0], attemptNo: 7, outcome }], now)
      ).toEqual([]);
    }
  );
  it('does not escalate when any of the five latest attempts has a known outcome', () => {
    const rows = attempts();
    rows[1] = { ...rows[1], outcome: 'scheduled' };
    expect(recancellationTasks(rows, now)).toEqual([]);
  });
  it('excludes an old last dispatch even when an older attempt number has a recent timestamp', () => {
    const rows = attempts();
    rows[4] = { ...rows[4], dispatchedAt: '2027-05-29T23:59:59Z' };
    expect(recancellationTasks(rows, now)).toEqual([]);
  });
  it('includes the 48 hour boundary and isolates intents', () => {
    const rows = attempts().map(row => ({ ...row, dispatchedAt: '2027-05-30T00:00:00Z' }));
    expect(
      recancellationTasks(
        [...rows, ...attempts(4).map(row => ({ ...row, intentId: 'other' }))],
        now
      )
    ).toEqual([{ kind: 'retrying_cancel', intentId: 'intent', userId: 'member', attempts: 12 }]);
  });
});
