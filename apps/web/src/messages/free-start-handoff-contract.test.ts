import { describe, expect, it } from 'vitest';

import { freeStartLocaleMessages } from './free-start-test-messages';

type HandoffCopy = {
  action: string;
  alreadyCreated: string;
  authorityTruth: string;
  claimLink: string;
  confirm: string;
  confirming: string;
  deleteIndependent: string;
  facts: Record<string, string>;
  heading: string;
  membershipRequired: string;
  sourceRetained: string;
  unavailable: string;
};

function handoff(locale: keyof typeof freeStartLocaleMessages): HandoffCopy {
  const messages = freeStartLocaleMessages[locale].freeStart as { secureSaveReviewCopy: string };
  return (JSON.parse(messages.secureSaveReviewCopy) as { handoff: HandoffCopy }).handoff;
}

describe('free-start draft handoff locale contract C22-C24', () => {
  it('keeps SQ/EN/SR/MK keys aligned with six fact labels and truthful lifecycle copy', () => {
    const copies = (['en', 'sq', 'sr', 'mk'] as const).map(handoff);
    const expectedKeys = Object.keys(copies[0]!).sort();
    for (const copy of copies) {
      expect(Object.keys(copy).sort()).toEqual(expectedKeys);
      expect(Object.keys(copy.facts).sort()).toEqual([
        'category',
        'counterparty',
        'desiredOutcome',
        'incidentDate',
        'issueType',
        'summary',
      ]);
      expect(copy.sourceRetained).toBeTruthy();
      expect(copy.deleteIndependent).toBeTruthy();
    }
  });

  it.each([
    ['en', /coverage/i, /accept/i],
    ['sq', /mbulim/i, /pranuar/i],
    ['sr', /pokri/i, /prihva/i],
    ['mk', /покрит/i, /прифат/i],
  ] as const)(
    '%s denies coverage and acceptance and preserves draft independence',
    (locale, coverage, acceptance) => {
      const copy = handoff(locale);
      expect(copy.authorityTruth).toMatch(coverage);
      expect(copy.authorityTruth).toMatch(acceptance);
      expect(`${copy.sourceRetained} ${copy.deleteIndependent}`).toMatch(/delete|fshi|bris|бриш/i);
    }
  );

  it('keeps prohibited internal workflow terms out of public SQ copy', () => {
    const publicSq = JSON.stringify(handoff('sq')).toLocaleLowerCase('sq');
    expect(publicSq).not.toContain('triazh');
    expect(publicSq).not.toContain('intake');
    expect(publicSq).not.toContain('rast');
  });
});
