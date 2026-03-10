import type { CommercialBillingTermsProps } from './billing-terms';

type CommercialTermsTranslator = (key: string) => string;

export type CommercialTermsSectionKey =
  | 'annualBilling'
  | 'cancellation'
  | 'refundWindow'
  | 'coolingOff'
  | 'acceptedMatters';

const DEFAULT_SECTION_KEYS: readonly CommercialTermsSectionKey[] = [
  'annualBilling',
  'cancellation',
  'refundWindow',
  'coolingOff',
  'acceptedMatters',
];

function buildCommercialTermsSection(
  t: CommercialTermsTranslator,
  sectionKey: CommercialTermsSectionKey
) {
  return {
    body: t(`sections.${sectionKey}.body`),
    title: t(`sections.${sectionKey}.title`),
  };
}

export function buildCommercialTermsProps(
  t: CommercialTermsTranslator,
  sectionTestId: NonNullable<CommercialBillingTermsProps['sectionTestId']>,
  sectionKeys: readonly CommercialTermsSectionKey[] = DEFAULT_SECTION_KEYS
): CommercialBillingTermsProps {
  return {
    eyebrow: t('eyebrow'),
    footerBody: t('footer.body'),
    footerTitle: t('footer.title'),
    sectionTestId,
    sections: sectionKeys.map(sectionKey => buildCommercialTermsSection(t, sectionKey)),
    subtitle: t('subtitle'),
    title: t('title'),
  };
}
