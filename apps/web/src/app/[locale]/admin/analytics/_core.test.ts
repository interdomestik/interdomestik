import { describe, expect, it } from 'vitest';

import { computeSuccessRate, normalizeTotalsRow } from './_core';

describe('admin analytics core', () => {
  it('normalizeTotalsRow defaults missing values to 0', () => {
    expect(normalizeTotalsRow(undefined)).toEqual({ sum: 0, avg: 0, count: 0 });
    expect(normalizeTotalsRow({ sum: null, avg: null, count: null })).toEqual({
      sum: 0,
      avg: 0,
      count: 0,
    });
  });

  it('computeSuccessRate returns 0 when totalsCount is 0', () => {
    expect(
      computeSuccessRate({
        totalsCount: 0,
        statusDistribution: [{ status: 'resolved', count: 10 }],
      })
    ).toBe(0);
  });

  it('computeSuccessRate uses resolved count over totals', () => {
    expect(
      computeSuccessRate({
        totalsCount: 20,
        statusDistribution: [
          { status: 'draft', count: 5 },
          { status: 'resolved', count: 10 },
        ],
      })
    ).toBe(50);
  });
});
