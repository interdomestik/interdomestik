import { describe, expect, it } from 'vitest';

import { buildCommercialTermsProps } from './billing-terms-content';

describe('buildCommercialTermsProps', () => {
  it('builds the shared annual billing rules from translation keys', () => {
    const t = (key: string) => `translated:${key}`;

    const props = buildCommercialTermsProps(t, 'pricing-billing-terms');

    expect(props.sectionTestId).toBe('pricing-billing-terms');
    expect(props.eyebrow).toBe('translated:eyebrow');
    expect(props.title).toBe('translated:title');
    expect(props.subtitle).toBe('translated:subtitle');
    expect(props.sections).toEqual([
      {
        body: 'translated:sections.annualBilling.body',
        title: 'translated:sections.annualBilling.title',
      },
      {
        body: 'translated:sections.cancellation.body',
        title: 'translated:sections.cancellation.title',
      },
      {
        body: 'translated:sections.refundWindow.body',
        title: 'translated:sections.refundWindow.title',
      },
      {
        body: 'translated:sections.coolingOff.body',
        title: 'translated:sections.coolingOff.title',
      },
      {
        body: 'translated:sections.acceptedMatters.body',
        title: 'translated:sections.acceptedMatters.title',
      },
    ]);
    expect(props.footerTitle).toBe('translated:footer.title');
    expect(props.footerBody).toBe('translated:footer.body');
  });
});
