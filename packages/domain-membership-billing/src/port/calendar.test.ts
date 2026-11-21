import { describe, expect, it } from 'vitest';

import { addMembershipYear, skopjeDate } from './calendar';

describe('Skopje civil dates', () => {
  it.each([
    ['2025-12-31T22:59:59.999Z', '2025-12-31'],
    ['2025-12-31T23:00:00.000Z', '2026-01-01'],
    ['2026-06-14T21:59:59.999Z', '2026-06-14'],
    ['2026-06-14T22:00:00.000Z', '2026-06-15'],
  ])('resolves %s to civil day %s', (instant, day) => {
    expect(skopjeDate(new Date(instant))).toBe(day);
  });
});

describe('inclusive membership year', () => {
  it.each([
    ['2024-02-29', '2025-02-27'],
    ['2023-03-01', '2024-02-29'],
    ['2025-12-31', '2026-12-30'],
    ['2026-01-01', '2026-12-31'],
  ])('covers %s through %s', (start, end) => {
    expect(addMembershipYear(start)).toBe(end);
  });

  it.each(['2025-02-29', '2026-04-31', '2026-1-01'])('refuses invalid date %s', day => {
    expect(() => addMembershipYear(day)).toThrow(RangeError);
  });
});
