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

function secureSaveCopy(messages: (typeof localeMessages)[keyof typeof localeMessages]) {
  return JSON.parse((messages.freeStart as { secureSave: string }).secureSave) as unknown;
}

function recoveryCopy(messages: (typeof localeMessages)[keyof typeof localeMessages]) {
  return (
    JSON.parse((messages.freeStart as { secureSave: string }).secureSave) as {
      recovery: Record<string, unknown>;
    }
  ).recovery;
}

describe('premium Free Start copy contract', () => {
  it.each(Object.entries(localeMessages))(
    '%s distinguishes optional saved facts from the temporary generated result',
    (_locale, messages) => {
      const boundary = messages.freeStart.trustBoundary;
      const truth = messages.freeStart.trustBoundary.body;
      const noRecoveryTruth = (
        JSON.parse(messages.freeStart.secureSaveReviewCopy) as { noRecovery?: string }
      ).noRecovery;
      expect(boundary.heading.trim()).not.toHaveLength(0);
      expect(boundary.heading).toMatch(/result|rezultat|rezultat|резултат/i);
      expect(truth).toMatch(/automatic|automatik|automatski|автоматски/i);
      expect(truth).toMatch(/successful|suksessh|uspešn|успешн/i);
      expect(truth).toMatch(/facts|fakte|činjenic|факт/i);
      expect(truth).toMatch(/temporary|përkohsh|privremen|привремен/i);
      expect(truth).toMatch(/not saved|nuk ruhet|nije sačuvan|не се зачувува/i);
      expect(truth).toMatch(/no case|nuk hap|nije otvoren|не се отвора/i);
      // prettier-ignore
      expect(noRecoveryTruth).toMatch(/nothing saves automatically|asgjë nuk ruhet automatikisht|ništa se ne čuva automatski|ништо не се зачувува автоматски/i);
      expect(noRecoveryTruth).toMatch(/temporary|përkohsh|privremen|привремен/i);
      expect(noRecoveryTruth).toMatch(/not saved|nuk ruhet|nije sačuvan|не се зачувува/i);
      expect(noRecoveryTruth).toMatch(/no case|nuk hap|nije otvoren|не се отвора/i);
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

  it('C29 keeps the secure-save lifecycle keys identical in SQ, EN, SR and MK', () => {
    const secureSaveCopies = Object.values(localeMessages).map(secureSaveCopy);
    const reviewCopies = Object.values(localeMessages).map(messages =>
      JSON.parse((messages.freeStart as { secureSaveReviewCopy: string }).secureSaveReviewCopy)
    );

    expect(secureSaveCopies.every(Boolean)).toBe(true);
    const keys = secureSaveCopies.map(copy => collectKeyPaths(copy).sort());
    expect(keys).toEqual([keys[0], keys[0], keys[0], keys[0]]);
    const reviewKeys = reviewCopies.map(copy => collectKeyPaths(copy).sort());
    expect(reviewKeys).toEqual([reviewKeys[0], reviewKeys[0], reviewKeys[0], reviewKeys[0]]);
  });

  it('C33 keeps the browser-recovery keys identical in SQ, EN, SR and MK', () => {
    const copies = Object.values(localeMessages).map(recoveryCopy);
    const keys = copies.map(copy => collectKeyPaths(copy).sort());

    expect(keys).toEqual([keys[0], keys[0], keys[0], keys[0]]);
  });

  it.each(Object.entries(localeMessages))(
    'C33 %s distinguishes local recovery, discard and verified secure save',
    (_locale, messages) => {
      const copy = collectCopyValues(recoveryCopy(messages)).join(' ');
      const secure = collectCopyValues(secureSaveCopy(messages)).join(' ');
      const idle = (secureSaveCopy(messages) as { status: { idle: string } }).status.idle;
      expect(copy).toMatch(/browser|shfletues|pregledač|прелистувач/i);
      expect(copy).toMatch(/30/);
      expect(copy).toMatch(/private|privat|приват/i);
      expect(copy).toMatch(/discard|hidh|odbaci|отфрли/i);
      expect(copy).toMatch(/secure|sigurt|bezbed|безбед/i);
      expect(copy).toMatch(/device|pajisje|uređaj|уред/i);
      expect(secure).toMatch(/browser|shfletues|pregledač|прелистувач/i);
      expect(idle).toMatch(/browser|shfletues|pregledač|прелистувач/i);
      expect(idle).not.toMatch(/automatic|automatik|automatski|автоматски/i);
    }
  );

  it.each(Object.entries(localeMessages))(
    'C29 %s states verified-email resume, bounded storage, conflict and permanent deletion truth',
    (locale, messages) => {
      const copy = collectCopyValues(secureSaveCopy(messages)).join(' ');

      expect(copy).toMatch(/email|e-pošt|е-пошт/i);
      expect(copy).toMatch(/device|pajisje|uređaj|уред/i);
      expect(copy).toMatch(/vehicle|property|automjet|pron|vozil|imovin|возил|имот/i);
      expect(copy).toMatch(/medical|mjek|zdrav|медицин|здрав/i);
      expect(copy).toMatch(/document|dokument|документ/i);
      expect(copy).toMatch(/conflict|changed|ndrysh|sukob|konflikt|izmen|конфликт|измен/i);
      expect(copy).toMatch(/permanent|përfundim|trajno|trajno|трајно/i);
      if (locale === 'sq') expect(copy).not.toMatch(/triazh|intake/i);
    }
  );
});
