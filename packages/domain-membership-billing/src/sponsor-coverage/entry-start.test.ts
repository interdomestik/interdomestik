import { describe, expect, it } from 'vitest';

import { entryStartIdempotencyKey, planEntryStart } from './entry-start';

const at = (m: number) => new Date(Date.UTC(2027, m, 1));

describe('planEntryStart', () => {
  it('sends an empty interval to staff review and queues nothing', () => {
    expect(
      planEntryStart({ start: at(6), end: at(6) }, { handover: true, hasCredential: false })
    ).toEqual({ outcome: 'staff_review', reviewReason: 'empty_interval', mails: [] });
  });

  it('seats a handover entry: confirmation now, notice and activation from start(E)', () => {
    expect(
      planEntryStart({ start: at(4), end: at(12) }, { handover: true, hasCredential: false })
    ).toEqual({
      outcome: 'seated',
      reviewReason: null,
      mails: [
        { kind: 'handover_confirmed', notBefore: null },
        { kind: 'sponsor_notice', notBefore: at(4) },
        { kind: 'activation', notBefore: at(4) },
      ],
    });
  });

  it('skips the handover confirmation and activation when they do not apply', () => {
    expect(
      planEntryStart({ start: at(0), end: at(12) }, { handover: false, hasCredential: true }).mails
    ).toEqual([{ kind: 'sponsor_notice', notBefore: at(0) }]);
  });

  it('keys each mail by entry and kind so a rerun queues nothing new', () => {
    expect(entryStartIdempotencyKey('entry-1', 'sponsor_notice')).toBe(
      'sponsor-entry:entry-1:sponsor_notice'
    );
  });
});
