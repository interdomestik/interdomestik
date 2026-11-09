import { describe, expect, it } from 'vitest';

import { isValidTermination } from './decisions';
import { isValidRevisionInput } from './terms';

const revision = {
  seatCount: 20,
  pricePerSeatMinor: 4900,
  currency: 'EUR',
  contractReference: 'C-2027-01',
  termsVersion: '2027-01',
};

describe('sponsor input rules', () => {
  it('accepts 1–500 seats, a non-negative price, ISO currency and references', () => {
    expect(isValidRevisionInput(revision)).toBe(true);
    for (const bad of [
      { seatCount: 0 },
      { seatCount: 501 },
      { seatCount: 2.5 },
      { pricePerSeatMinor: -1 },
      { currency: 'eur' },
      { contractReference: ' ' },
      { termsVersion: '' },
    ]) {
      expect(isValidRevisionInput({ ...revision, ...bad })).toBe(false);
    }
  });

  it('terminates at least 24 h ahead, inside the term, without an approved successor', () => {
    const now = new Date('2027-03-01T00:00:00Z');
    const params = {
      now,
      effectiveAt: new Date('2027-03-02T00:00:00Z'),
      termStart: new Date('2027-01-01T00:00:00Z'),
      termEnd: new Date('2028-01-01T00:00:00Z'),
      hasContiguousApprovedSuccessor: false,
    };
    expect(isValidTermination(params)).toBe(true);
    expect(isValidTermination({ ...params, effectiveAt: new Date('2027-03-01T23:59:59Z') })).toBe(
      false
    );
    expect(isValidTermination({ ...params, effectiveAt: new Date('2028-01-02T00:00:00Z') })).toBe(
      false
    );
    expect(isValidTermination({ ...params, hasContiguousApprovedSuccessor: true })).toBe(false);
  });
});
