import { describe, expect, it } from 'vitest';
import type { SponsorOutlook } from '../../sponsor-coverage/outlook';
import { sponsorAccessContinues } from './dunning-sponsor';

const periodEnd = new Date('2027-01-01T00:00:00Z');
const outlook = (covering: boolean, nextStart: string | null): SponsorOutlook => ({
  covering: covering ? ({} as SponsorOutlook['covering']) : null,
  nextStart: nextStart ? new Date(nextStart) : null,
});

describe('sponsorAccessContinues', () => {
  it.each([
    ['no sponsor outlook', undefined, periodEnd, false],
    ['covered now', outlook(true, null), periodEnd, true],
    ['coverage starts by the period end', outlook(false, '2027-01-01T00:00:00Z'), periodEnd, true],
    [
      'coverage starts after the period end',
      outlook(false, '2027-01-02T00:00:00Z'),
      periodEnd,
      false,
    ],
    [
      'future coverage without a known period end',
      outlook(false, '2026-12-01T00:00:00Z'),
      null,
      false,
    ],
  ] as const)('%s', (_name, value, end, expected) => {
    expect(sponsorAccessContinues(value, end)).toBe(expected);
  });
});
