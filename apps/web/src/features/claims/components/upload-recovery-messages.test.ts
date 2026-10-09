import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('next-intl');
import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';

describe('upload recovery message namespace', () => {
  it.each([
    ['en', en],
    ['sq', sq],
    ['mk', mk],
    ['sr', sr],
  ] as const)(
    'resolves the mounted claims namespace in %s without fallback',
    (locale, messages) => {
      const t = createTranslator({
        locale,
        messages,
        namespace: 'claims',
        onError: error => {
          throw error;
        },
      });
      if (locale === 'sr') {
        for (const value of Object.values(messages.claims.uploadRecovery)) {
          expect(value).not.toMatch(/\p{Script=Cyrillic}/u);
        }
      }
      for (const key of ['description', 'action', 'identityChanged'] as const) {
        expect(t(`uploadRecovery.${key}`)).toBe(messages.claims.uploadRecovery[key]);
        expect(t(`uploadRecovery.${key}`).length).toBeGreaterThan(0);
      }
      for (const key of [
        'detail.evidence',
        'detail.documentsEmpty',
        'informationRequests.download',
      ] as const) {
        expect(t(key).length).toBeGreaterThan(0);
      }
    }
  );
});
