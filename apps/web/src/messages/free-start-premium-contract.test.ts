import { describe, expect, it } from 'vitest';

import sqInjuryJourney from './sq/injuryJourney.json';
import sqPropertyJourney from './sq/propertyJourney.json';
import {
  freeStartLocaleMessages as localeMessages,
  sqFreeStartMessages as sq,
} from './free-start-test-messages';

function collectCopyValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];

  return Object.values(value).flatMap(collectCopyValues);
}

function collectKeyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' ? collectKeyPaths(child, path) : [path];
  });
}

describe('premium Free Start copy contract', () => {
  it.each(Object.entries(localeMessages))(
    '%s states that the summary is temporary, unsaved and does not open a case',
    (_locale, messages) => {
      const boundary = messages.freeStart.trustBoundary;

      expect(boundary.heading.trim()).not.toHaveLength(0);
      expect(boundary.heading).not.toMatch(/stays|remain|mbeten|ostaju|остануваат/i);
      expect(boundary.body.trim()).not.toHaveLength(0);
      expect(boundary.body).toMatch(/temporary|përkohshme|privremen|привремен/i);
      expect(boundary.body).toMatch(/not saved|nuk është ruajtur|nije sačuvan|не се зачувува/i);
      expect(boundary.body).toMatch(/no case|nuk është hapur|nije otvoren|не е отворен/i);
    }
  );

  it('keeps the same premium organizer keys in every locale', () => {
    const keys = Object.values(localeMessages).map(messages =>
      Object.keys(messages.freeStart.selectedSituation).sort()
    );

    expect(keys).toEqual([keys[0], keys[0], keys[0], keys[0]]);
  });

  it('keeps the complete successful-result contract in every locale', () => {
    const resultCopies = Object.values(localeMessages).map(
      messages => (messages.freeStart as { result?: unknown }).result
    );

    expect(resultCopies.every(Boolean)).toBe(true);
    const keys = resultCopies.map(result => collectKeyPaths(result).sort());
    expect(keys).toEqual([keys[0], keys[0], keys[0], keys[0]]);
  });

  it.each(Object.entries(localeMessages))(
    '%s uses plain-language review copy instead of public triage jargon',
    (_locale, messages) => {
      const publicCopy = collectCopyValues(messages.freeStart).join(' ');

      expect(publicCopy).not.toMatch(/triage|triage-u|trija[zž]|trijaža|тријаж/i);
    }
  );

  it('keeps internal intake jargon out of Albanian public organizer handoffs', () => {
    const publicCopy = [
      ...collectCopyValues(sq.freeStart),
      ...collectCopyValues(sqInjuryJourney.injuryJourney.evidence),
      ...collectCopyValues(sqPropertyJourney.propertyJourney.evidence),
    ].join(' ');

    expect(publicCopy).not.toMatch(/intake/i);
  });
});
