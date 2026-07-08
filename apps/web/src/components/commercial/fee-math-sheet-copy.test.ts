import { describe, expect, it } from 'vitest';

import {
  FEE_MATH_SHEET_COPY_KEYS,
  getFeeMathSheetCopy,
  THIRD_PARTY_COST_TREATMENT,
} from './fee-math-sheet-copy';

describe('fee math sheet copy', () => {
  it('limits court-path treatment to the reviewed fees copy keys', () => {
    expect(FEE_MATH_SHEET_COPY_KEYS).toEqual([
      'fees.lossPromise',
      'fees.courtPathCosts',
      'fees.thirdPartyCosts',
      'fees.reimbursement',
    ]);
    expect(THIRD_PARTY_COST_TREATMENT).toEqual({
      mode: 'written_agreement_required',
      reviewedCopyKeys: FEE_MATH_SHEET_COPY_KEYS,
    });
  });

  it('keeps the copy qualified and blocks zero-external-cost wording', () => {
    const copy = getFeeMathSheetCopy('en');
    const text = [copy.body, ...copy.rows.map(row => row.body)].join(' ');

    expect(text).toContain('no success fee to Interdomestik');
    expect(text).toContain('written court-path agreement');
    expect(text).not.toContain('recover nothing, pay nothing');
    expect(text).not.toContain('all external court-path costs are always zero');
  });

  it('uses the signed Albanian addendum wording for sq locale', () => {
    const copy = getFeeMathSheetCopy('sq');

    expect(copy.rows.map(row => row.key)).toEqual(FEE_MATH_SHEET_COPY_KEYS);
    expect(copy.body).toContain('Nëse nuk ka rikuperim');
    expect(copy.body).toContain('marrëveshja me shkrim');
  });

  it('does not fall back to English for mk and sr locales', () => {
    expect(getFeeMathSheetCopy('mk').title).toContain('Судските трошоци');
    expect(getFeeMathSheetCopy('sr').title).toContain('Sudski troškovi');
  });
});
