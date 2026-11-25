import de from '@/messages/de/legal-documents.json';
import en from '@/messages/en/legal-documents.json';
import mk from '@/messages/mk/legal-documents.json';
import sq from '@/messages/sq/legal-documents.json';
import sr from '@/messages/sr/legal-documents.json';
import type { LegalDocument, RenderedLegalText } from '@interdomestik/domain-privacy/acceptance';
import { createTranslator, IntlErrorCode, type AbstractIntlMessages } from 'next-intl';

const catalogues: Readonly<Record<string, typeof en | undefined>> = { de, en, mk, sq, sr };

export type LegalTextForDisplay = LegalDocument & {
  blocks: readonly { key: string; text: string }[];
};

const billingKeys = [
  'eyebrow',
  'title',
  'subtitle',
  'sections.annualBilling.title',
  'sections.annualBilling.body',
  'sections.cancellation.title',
  'sections.cancellation.body',
  'sections.refundWindow.title',
  'sections.refundWindow.body',
  'sections.coolingOff.title',
  'sections.coolingOff.body',
  'sections.acceptedMatters.title',
  'sections.acceptedMatters.body',
  'footer.title',
  'footer.body',
];

const keys = {
  terms: [
    'title',
    'intro',
    'sections.membership',
    'sections.services',
    'sections.fees',
    ...billingKeys.map(key => `sections.billing.${key}`),
  ],
  privacy_notice: [
    'title',
    'intro',
    'sections.handling.title',
    'sections.handling.body',
    'sections.rights.title',
    'sections.rights.body',
    'sections.deletion.title',
    'sections.deletion.body',
    'sections.deletion.followup',
  ],
};

export function renderLegalTexts(locale: string, documents: readonly LegalDocument[]) {
  const messages = Object.hasOwn(catalogues, locale) ? catalogues[locale] : undefined;
  if (!messages) {
    return { ok: false, code: 'legal_text_mismatch' } as const;
  }
  let invalid = false;
  const t = createTranslator<AbstractIntlMessages, 'legal-documents'>({
    locale,
    messages,
    namespace: 'legal-documents',
    onError: error => {
      if (error.code !== IntlErrorCode.MISSING_MESSAGE) throw error;
      invalid = true;
    },
  });
  const texts: (RenderedLegalText & LegalTextForDisplay)[] = documents.map(({ kind, version }) => {
    const blocks = keys[kind].map(key => ({ key, text: t(`${kind}.${version}.${key}`) }));
    return { kind, version, blocks, values: blocks.map(block => block.text) };
  });
  if (invalid || texts.some(text => text.values.some(value => !value.trim()))) {
    return { ok: false, code: 'legal_text_mismatch' } as const;
  }
  return { ok: true, texts } as const;
}
