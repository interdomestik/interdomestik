import { describe, expect, it } from 'vitest';
import { DE_COPY } from './copy-de';
import { EN_COPY } from './copy-en';
import { MK_COPY } from './copy-mk';
import { SQ_COPY } from './copy-sq';
import { SR_COPY } from './copy-sr';
import { renderSponsorMail } from './index';
import type { SponsorMailInput, SponsorMailKind, SponsorMailLocale } from './index';

const LOCALES: SponsorMailLocale[] = ['sq', 'en', 'mk', 'sr', 'de'];
const KINDS = [
  'sponsor_notice',
  'handover_pending',
  'handover_confirmed',
  'foreign_account',
  'not_eligible',
  'renewal_notice',
  'membership_end_offer',
  'opt_out_confirmation',
];
const GREETINGS: Record<SponsorMailLocale, string> = {
  en: 'Hello,',
  sq: 'Përshëndetje,',
  mk: 'Здраво,',
  sr: 'Zdravo,',
  de: 'Guten Tag,',
};
const COMMON = {
  locale: 'en' as const,
  firstName: 'Arta',
  supportEmail: 'support@example.test',
};
const COMPANY = { ...COMMON, companyName: 'Example Company' };
const NOTICE = {
  ...COMPANY,
  kind: 'sponsor_notice' as const,
  entityName: 'Example Country Entity',
  startDate: '01/12/2026',
  termEnd: '30/11/2027',
  optOutUrl: 'https://example.test/leave?token=abc&lang=en',
  loginUrl: 'https://example.test/login',
};
const FIXTURES = {
  sponsor_notice: NOTICE,
  handover_pending: { ...COMPANY, kind: 'handover_pending' },
  handover_confirmed: {
    ...COMPANY,
    kind: 'handover_confirmed',
    startDate: '01/12/2026',
  },
  foreign_account: { ...COMPANY, kind: 'foreign_account' },
  not_eligible: { ...COMPANY, kind: 'not_eligible' },
  renewal_notice: { ...COMPANY, kind: 'renewal_notice', termEnd: '30/11/2027' },
  membership_end_offer: {
    ...COMMON,
    kind: 'membership_end_offer',
    offerUrl: 'https://example.test/offer',
  },
  opt_out_confirmation: { ...COMPANY, kind: 'opt_out_confirmation' },
} satisfies { [Kind in SponsorMailKind]: Extract<SponsorMailInput, { kind: Kind }> };
const CASES = LOCALES.flatMap(locale =>
  Object.values(FIXTURES).map(input => ({ ...input, locale }))
);

describe('renderSponsorMail', () => {
  it('has exactly the eight specified kinds in every locale', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...KINDS].sort());
    for (const copy of [SQ_COPY, EN_COPY, MK_COPY, SR_COPY, DE_COPY]) {
      expect(Object.keys(copy.messages).sort()).toEqual([...KINDS].sort());
    }
    expect(CASES).toHaveLength(40);
  });

  it.each(CASES)('$kind / $locale renders every parameter in plain text', input => {
    const email = renderSponsorMail(input);
    for (const part of [email.subject, email.html, email.text]) {
      expect(part.trim().length).toBeGreaterThan(0);
    }
    for (const [key, value] of Object.entries(input)) {
      if (key !== 'kind' && key !== 'locale' && value !== null) {
        expect(email.text).toContain(value);
      }
    }
    expect(email.text).not.toMatch(/<[^>]+>/);
    expect(email.text).not.toMatch(/\b(?:credit|kredi|кредит|kredit|Guthaben)\b/i);
    expect(email.html).toContain(`<html lang="${input.locale}">`);
    if (input.locale === 'sr') expect(email.text).not.toMatch(/[\u0400-\u04ff]/);
  });

  it.each(CASES)('$kind / $locale uses the neutral greeting for null firstName', input => {
    const email = renderSponsorMail({ ...input, firstName: null });
    expect(email.text.split('\n\n')[1]).toBe(GREETINGS[input.locale]);
    expect(email.html).toContain(`<p>${GREETINGS[input.locale]}</p>`);
    expect(email.text).not.toContain('null');
  });

  it.each(CASES)('$kind / $locale escapes names without changing the text values', input => {
    const value = '<script>&"\'';
    const escaped = '&lt;script&gt;&amp;&quot;&#39;';
    const email = renderSponsorMail({ ...input, firstName: value });
    expect(email.html).toContain(escaped);
    expect(email.html).not.toContain(value);
    expect(email.text).toContain(value);
    if ('companyName' in input) {
      const companyEmail = renderSponsorMail({ ...input, companyName: value });
      expect(companyEmail.html).toContain(escaped);
      expect(companyEmail.html).not.toContain(value);
      expect(companyEmail.text).toContain(value);
    }
  });

  it.each(LOCALES)('%s escapes every other interpolated field and both link attributes', locale => {
    const value = '<script>&"\'';
    const url = `https://example.test/path?value=${value}`;
    const email = renderSponsorMail({
      ...NOTICE,
      locale,
      entityName: value,
      supportEmail: value,
      startDate: value,
      termEnd: value,
      optOutUrl: url,
      loginUrl: url,
    });
    expect(email.html).not.toContain(value);
    expect(email.html).toContain('&lt;script&gt;&amp;&quot;&#39;');
    expect(
      email.html.match(
        /href="https:\/\/example\.test\/path\?value=&lt;script&gt;&amp;&quot;&#39;"/g
      )
    ).toHaveLength(2);
    expect(email.text).toContain(url);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'invalid-url'])(
    'keeps an unsafe or invalid URL as text instead of an active link: %s',
    offerUrl => {
      const email = renderSponsorMail({ ...FIXTURES.membership_end_offer, offerUrl });
      expect(email.html).not.toContain('<a ');
      expect(email.html).not.toContain('<script>');
      expect(email.text).toContain(offerUrl);
    }
  );

  it('includes actionable opt-out, sign-in and individual-offer links', () => {
    const notice = renderSponsorMail(NOTICE);
    expect(notice.html).toContain('href="https://example.test/leave?token=abc&amp;lang=en"');
    expect(notice.html).toContain(`href="${NOTICE.loginUrl}"`);
    expect(notice.text).toContain('"Leave" on the membership page after signing in');
    const offer = renderSponsorMail(FIXTURES.membership_end_offer);
    expect(offer.html).toContain('href="https://example.test/offer"');
    expect(offer.text).not.toContain(COMPANY.companyName);
  });

  it('distinguishes pending renewal cancellation from confirmed cancellation', () => {
    const pending = renderSponsorMail(FIXTURES.handover_pending).text;
    expect(pending).toContain('We have asked');
    expect(pending).toContain('until its current period ends');
    expect(pending).toContain('Nothing is refunded and nothing is lost');
    expect(pending).toContain('starts when the paid one ends');
    const confirmed = renderSponsorMail(FIXTURES.handover_confirmed).text;
    expect(confirmed).toContain('Your individual renewal is stopped');
    expect(confirmed).toContain('starts on 01/12/2026');
  });

  it('states data control, limited company visibility and account retention', () => {
    const notice = renderSponsorMail(NOTICE).text;
    expect(notice).toContain('holds and controls');
    expect(notice).toContain('(name and e-mail address)');
    expect(notice).toContain('only sees that you are registered');
    expect(notice).toContain('never your claims, documents, messages or usage');
    expect(notice).toContain('The account is yours');
    const optOut = renderSponsorMail(FIXTURES.opt_out_confirmation).text;
    expect(optOut).toContain('Your account is not deleted');
    expect(optOut).toContain(`To delete it, contact ${COMMON.supportEmail}`);
  });
});
