import enFooter from './en/footer.json';
import enFreeStart from './en/freeStart.json';
import enHero from './en/hero.json';
import enMembership from './en/membership.json';
import enPricing from './en/pricing.json';
import enServicesPage from './en/servicesPage.json';
import enTrust from './en/trust.json';
import mkFooter from './mk/footer.json';
import mkFreeStart from './mk/freeStart.json';
import mkHero from './mk/hero.json';
import mkMembership from './mk/membership.json';
import mkPricing from './mk/pricing.json';
import mkServicesPage from './mk/servicesPage.json';
import mkTrust from './mk/trust.json';
import sqFooter from './sq/footer.json';
import sqFreeStart from './sq/freeStart.json';
import sqHero from './sq/hero.json';
import sqMembership from './sq/membership.json';
import sqPricing from './sq/pricing.json';
import sqServicesPage from './sq/servicesPage.json';
import sqTrust from './sq/trust.json';
import srFooter from './sr/footer.json';
import srFreeStart from './sr/freeStart.json';
import srHero from './sr/hero.json';
import srMembership from './sr/membership.json';
import srPricing from './sr/pricing.json';
import srServicesPage from './sr/servicesPage.json';
import srTrust from './sr/trust.json';
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

const trustSurfaceContracts = [
  {
    locale: 'en',
    hero: enHero.hero,
    trust: enTrust.trust,
    footer: enFooter.footer,
    freeStart: enFreeStart.freeStart,
    servicesPage: enServicesPage.servicesPage,
  },
  {
    locale: 'sq',
    hero: sqHero.hero,
    trust: sqTrust.trust,
    footer: sqFooter.footer,
    freeStart: sqFreeStart.freeStart,
    servicesPage: sqServicesPage.servicesPage,
  },
  {
    locale: 'mk',
    hero: mkHero.hero,
    trust: mkTrust.trust,
    footer: mkFooter.footer,
    freeStart: mkFreeStart.freeStart,
    servicesPage: mkServicesPage.servicesPage,
  },
  {
    locale: 'sr',
    hero: srHero.hero,
    trust: srTrust.trust,
    footer: srFooter.footer,
    freeStart: srFreeStart.freeStart,
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

  it.each(trustSurfaceContracts)(
    'keeps the trust-surface translation contract intact for $locale',
    ({ hero, trust, footer, freeStart, servicesPage }) => {
      expect(hero.v2.title).toBeTruthy();
      expect(hero.v2.subtitle).toBeTruthy();
      expect(hero.v2.helpNow).toBeTruthy();
      expect(hero.v2.proofChips).toHaveLength(3);
      expect(hero.v2.trustCues).toHaveLength(3);

      expect(trust.activeMembers).toBeTruthy();
      expect(trust.hotlineResponse).toBeTruthy();
      expect(trust.trustCuesLabel).toBeTruthy();
      expect(trust.trustCues).toHaveLength(3);

      expect(footer.safetyNet.eyebrow).toBeTruthy();
      expect(footer.safetyNet.title).toBeTruthy();
      expect(footer.safetyNet.body).toBeTruthy();
      expect(footer.safetyNet.call).toBeTruthy();
      expect(footer.safetyNet.whatsapp).toBeTruthy();
      expect(footer.safetyNet.chips).toHaveLength(3);

      expect(freeStart.completion.nextStep.levels.high).toBeTruthy();
      expect(freeStart.completion.cta.hotline.low).toBeTruthy();
      expect(freeStart.trust.evidence.vehicle.items.first).toBeTruthy();
      expect(freeStart.trust.evidence.property.items.first).toBeTruthy();
      expect(freeStart.trust.evidence.injury.items.first).toBeTruthy();
      expect(freeStart.trust.privacy.body).toBeTruthy();
      expect(freeStart.trust.triage.body).toBeTruthy();

      expect(servicesPage.disclaimers.freeStart.body).toBeTruthy();
      expect(servicesPage.disclaimers.hotline.body).toBeTruthy();
      expect(servicesPage.categories.consultation.services[0].description).toBeTruthy();
      expect(servicesPage.categories.expertise.services[0].description).toBeTruthy();
      expect(servicesPage.categories.legal.services[1].description).toBeTruthy();
      expect(servicesPage.scope.boundary.body).toBeTruthy();
    }
  );
});
