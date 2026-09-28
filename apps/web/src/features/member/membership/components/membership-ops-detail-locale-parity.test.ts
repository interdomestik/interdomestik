import en from '@/messages/en/membership.json';
import mk from '@/messages/mk/membership.json';
import sq from '@/messages/sq/membership.json';
import sr from '@/messages/sr/membership.json';
import { describe, expect, it } from 'vitest';

describe('Ops membership detail truthful-facts locale parity', () => {
  const catalogs = { en, sq, mk, sr };

  it('carries the current-period label in every pilot locale', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      expect(catalog.membership.plan.current_period_label, locale).toBeTruthy();
    }
  });

  it('carries every grace-deadline key in every pilot locale', () => {
    const expectedKeys = [
      'grace_deadline_title',
      'grace_deadline_future_label',
      'grace_deadline_passed_label',
      'grace_deadline_unavailable',
    ] as const;

    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of expectedKeys) {
        expect(catalog.membership.dunning, locale).toHaveProperty(key);
        expect(catalog.membership.dunning[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it('carries every timeline content key in every pilot locale', () => {
    const expectedKeys = [
      'title',
      'empty',
      'created_title',
      'created_description',
      'period_end_title',
      'period_ended_title',
      'period_end_description',
      'canceled_title',
      'canceled_description',
    ] as const;

    for (const [locale, catalog] of Object.entries(catalogs)) {
      for (const key of expectedKeys) {
        expect(catalog.membership.timeline, locale).toHaveProperty(key);
        expect(catalog.membership.timeline[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it('never uses the word renew in the timeline period-end titles', () => {
    for (const [locale, catalog] of Object.entries(catalogs)) {
      expect(catalog.membership.timeline.period_end_title.toLowerCase(), locale).not.toMatch(
        /renew/
      );
      expect(catalog.membership.timeline.period_ended_title.toLowerCase(), locale).not.toMatch(
        /renew/
      );
    }
  });
});
