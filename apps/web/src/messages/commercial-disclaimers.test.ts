import enMembership from './en/membership.json';
import enPricing from './en/pricing.json';
import enServicesPage from './en/servicesPage.json';
import mkMembership from './mk/membership.json';
import mkPricing from './mk/pricing.json';
import mkServicesPage from './mk/servicesPage.json';
import sqMembership from './sq/membership.json';
import sqPricing from './sq/pricing.json';
import sqServicesPage from './sq/servicesPage.json';
import srMembership from './sr/membership.json';
import srPricing from './sr/pricing.json';
import srServicesPage from './sr/servicesPage.json';
import { describe, expect, it } from 'vitest';

const localeContracts = [
  {
    locale: 'en',
    membership: enMembership.membership,
    pricing: enPricing.pricing,
    servicesPage: enServicesPage.servicesPage,
  },
  {
    locale: 'sq',
    membership: sqMembership.membership,
    pricing: sqPricing.pricing,
    servicesPage: sqServicesPage.servicesPage,
  },
  {
    locale: 'mk',
    membership: mkMembership.membership,
    pricing: mkPricing.pricing,
    servicesPage: mkServicesPage.servicesPage,
  },
  {
    locale: 'sr',
    membership: srMembership.membership,
    pricing: srPricing.pricing,
    servicesPage: srServicesPage.servicesPage,
  },
] as const;

describe('commercial disclaimer copy', () => {
  it.each(localeContracts)(
    'defines Free Start and hotline disclaimer copy for $locale commercial surfaces',
    ({ membership, pricing, servicesPage }) => {
      expect(pricing.disclaimers.freeStart.title).toBeTruthy();
      expect(pricing.disclaimers.freeStart.body).toBeTruthy();
      expect(pricing.disclaimers.hotline.title).toBeTruthy();
      expect(pricing.disclaimers.hotline.body).toBeTruthy();

      expect(servicesPage.disclaimers.freeStart.title).toBeTruthy();
      expect(servicesPage.disclaimers.freeStart.body).toBeTruthy();
      expect(servicesPage.disclaimers.hotline.title).toBeTruthy();
      expect(servicesPage.disclaimers.hotline.body).toBeTruthy();

      expect(membership.disclaimers.freeStart.title).toBeTruthy();
      expect(membership.disclaimers.freeStart.body).toBeTruthy();
      expect(membership.disclaimers.hotline.title).toBeTruthy();
      expect(membership.disclaimers.hotline.body).toBeTruthy();
      expect(membership.success.hotline_disclaimer.title).toBeTruthy();
      expect(membership.success.hotline_disclaimer.body).toBeTruthy();
      expect(membership.card.hotline_disclaimer.title).toBeTruthy();
      expect(membership.card.hotline_disclaimer.body).toBeTruthy();
    }
  );

  it('keeps the English disclaimer language aligned to the tracker contract', () => {
    expect(enPricing.pricing.disclaimers.freeStart.body.toLowerCase()).toContain('informational');
    expect(enPricing.pricing.disclaimers.hotline.body.toLowerCase()).toContain('routing');
    expect(enPricing.pricing.disclaimers.hotline.body.toLowerCase()).toContain('support');
    expect(enServicesPage.servicesPage.disclaimers.freeStart.body.toLowerCase()).toContain(
      'informational'
    );
    expect(enServicesPage.servicesPage.disclaimers.hotline.body.toLowerCase()).toContain('routing');
    expect(enServicesPage.servicesPage.disclaimers.hotline.body.toLowerCase()).toContain('support');
    expect(enMembership.membership.success.hotline_disclaimer.body.toLowerCase()).toContain(
      'routing'
    );
    expect(enMembership.membership.card.hotline_disclaimer.body.toLowerCase()).toContain('routing');
  });
});
