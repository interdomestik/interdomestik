import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';
import { CLAIM_MAIL_COPY } from './index';
import { renderClaimMail } from './render';
import type { ClaimMailLocale, ClaimMailRenderArgs } from './types';

const link = { baseUrl: 'https://example.com/', claimId: 'case-1' };
const claimTitle = 'Private case title';
const senderName = 'Private sender name';
const excerpt = 'Private message excerpt';
const claimNumber = 'CLM-2026-42';
const memberFacts = { ...link, claimTitle };
const staffFacts = { ...link, claimNumber, category: 'vehicle' };
const statusFacts = { ...memberFacts, fromStatus: 'submitted', toStatus: 'evaluation' } as const;

function leafEntries(tree: object, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix + key;
    return typeof value === 'string' ? [[path, value]] : leafEntries(value, `${path}.`);
  });
}

describe('claim mail', () => {
  it('has every copy key and all nine status labels in every locale', () => {
    expect(Object.keys(CLAIM_MAIL_COPY).sort((a, b) => a.localeCompare(b))).toEqual([
      'de',
      'en',
      'mk',
      'sq',
      'sr',
    ]);
    const keys = leafEntries(CLAIM_MAIL_COPY.en)
      .map(([key]) => key)
      .sort((a, b) => a.localeCompare(b));
    for (const copy of Object.values(CLAIM_MAIL_COPY)) {
      const entries = leafEntries(copy);
      expect(entries.map(([key]) => key).sort((a, b) => a.localeCompare(b))).toEqual(keys);
      expect(Object.keys(copy.statuses).sort((a, b) => a.localeCompare(b))).toEqual(
        [...CLAIM_STATUSES].sort((a, b) => a.localeCompare(b))
      );
      for (const [key, value] of entries) expect(value.trim(), key).not.toBe('');
    }
  });

  const mkExamples = [
    [
      ['claim_submitted', 'mk', { ...memberFacts, category: 'vehicle' }],
      CLAIM_MAIL_COPY.mk.messages.claim_submitted,
      CLAIM_MAIL_COPY.en.messages.claim_submitted,
    ],
    [
      ['claim_status_changed', 'mk', statusFacts],
      CLAIM_MAIL_COPY.mk.messages.claim_status_changed,
      CLAIM_MAIL_COPY.en.messages.claim_status_changed,
    ],
    [
      ['claim_recovery_decision', 'mk', { ...memberFacts, decision: 'accepted' }],
      CLAIM_MAIL_COPY.mk.messages.claim_recovery_decision.accepted,
      CLAIM_MAIL_COPY.en.messages.claim_recovery_decision.accepted,
    ],
    [
      ['claim_recovery_decision', 'mk', { ...memberFacts, decision: 'declined' }],
      CLAIM_MAIL_COPY.mk.messages.claim_recovery_decision.declined,
      CLAIM_MAIL_COPY.en.messages.claim_recovery_decision.declined,
    ],
    [
      [
        'claim_message_to_member',
        'mk',
        { ...memberFacts, previewRestricted: false, senderName, excerpt },
      ],
      CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.full,
      CLAIM_MAIL_COPY.en.messages.claim_message_to_member.full,
    ],
    [
      ['claim_message_to_member', 'mk', { ...link, previewRestricted: true }],
      CLAIM_MAIL_COPY.mk.messages.claim_message_to_member.restricted,
      CLAIM_MAIL_COPY.en.messages.claim_message_to_member.restricted,
    ],
    [
      ['staff_claim_submitted', 'mk', staffFacts],
      CLAIM_MAIL_COPY.mk.messages.staff_claim_submitted,
      CLAIM_MAIL_COPY.en.messages.staff_claim_submitted,
    ],
    [
      ['staff_member_message', 'mk', staffFacts],
      CLAIM_MAIL_COPY.mk.messages.staff_member_message,
      CLAIM_MAIL_COPY.en.messages.staff_member_message,
    ],
  ] satisfies [ClaimMailRenderArgs, { heading: string }, { heading: string }][];

  it.each(mkExamples)('localizes %j in Macedonian', (args, mk, en) => {
    const { html, subject, text } = renderClaimMail(...args);
    const mkHeading = mk.heading.replace('{toStatus}', CLAIM_MAIL_COPY.mk.statuses.evaluation);
    const enHeading = en.heading.replace('{toStatus}', CLAIM_MAIL_COPY.en.statuses.evaluation);
    expect(subject).toBe(mkHeading);
    expect(html).toContain('<html lang="mk">');
    expect(html).toContain(mkHeading);
    expect(text).toContain(mkHeading);
    expect(`${html}\n${text}`).not.toContain(enHeading);
  });

  it.each(Object.keys(CLAIM_MAIL_COPY) as ClaimMailLocale[])(
    'renders every claim email in %s',
    locale => {
      for (const [[kind, , facts]] of mkExamples) {
        const args = [kind, locale, facts] as ClaimMailRenderArgs;
        const rendered = renderClaimMail(...args);
        expect(rendered.html).toContain(`<html lang="${locale}">`);
        expect(rendered.html).toContain(`/${locale}/`);
        expect(rendered.subject).not.toMatch(/\{\w+\}/);
      }
    }
  );

  it('renders the localized status pair and a locale-specific member link', () => {
    const { text } = renderClaimMail('claim_status_changed', 'mk', statusFacts);
    expect(text).toContain(CLAIM_MAIL_COPY.mk.statuses.submitted);
    expect(text).toContain(CLAIM_MAIL_COPY.mk.statuses.evaluation);
    expect(text).toContain('https://example.com/mk/member/claims/case-1');
  });

  it('renders the title, sender and excerpt in a full message preview', () => {
    const { html, text } = renderClaimMail('claim_message_to_member', 'en', {
      ...memberFacts,
      previewRestricted: false,
      senderName,
      excerpt,
    });
    for (const value of [claimTitle, senderName, excerpt]) {
      expect(html).toContain(value);
      expect(text).toContain(value);
    }
  });

  it('ignores preview facts when a member message is restricted', () => {
    const extraFacts = { claimTitle, senderName, excerpt };
    const rendered = renderClaimMail('claim_message_to_member', 'en', {
      ...link,
      ...extraFacts,
      previewRestricted: true,
    });
    for (const output of Object.values(rendered)) {
      for (const value of Object.values(extraFacts)) expect(output).not.toContain(value);
    }
  });

  it.each(['staff_claim_submitted', 'staff_member_message'] as const)(
    'limits %s to the claim number, catalogue category and staff link',
    kind => {
      const extraFacts = { claimTitle, senderName, excerpt, message: 'Private member message' };
      const rendered = renderClaimMail(kind, 'mk', { ...staffFacts, ...extraFacts });
      for (const output of Object.values(rendered)) {
        for (const value of Object.values(extraFacts)) expect(output).not.toContain(value);
      }
      for (const output of [rendered.html, rendered.text]) {
        expect(output).toContain(claimNumber);
        expect(output).toContain(CLAIM_MAIL_COPY.mk.categories.vehicle);
        expect(output).toContain('https://example.com/mk/staff/claims/case-1');
      }
    }
  );

  it.each(['free-form category', 'constructor'])('uses a generic label for %s', category => {
    const { text } = renderClaimMail('staff_claim_submitted', 'mk', { ...staffFacts, category });
    expect(text).toContain(CLAIM_MAIL_COPY.mk.genericCategory);
    expect(text).not.toContain(category);
  });

  it('escapes HTML in a claim title and encodes the claim ID as a URL path segment', () => {
    const { html } = renderClaimMail('claim_submitted', 'en', {
      ...link,
      claimId: '"?next=/',
      claimTitle: '<script>alert("claim")</script>',
      category: 'vehicle',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;claim&quot;)&lt;/script&gt;');
    expect(html).toContain('href="https://example.com/en/member/claims/%22%3Fnext%3D%2F"');
  });
});
