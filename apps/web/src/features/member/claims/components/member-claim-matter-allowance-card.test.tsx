import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import deClaims from '@/messages/de/claims.json';
import enClaims from '@/messages/en/claims.json';
import mkClaims from '@/messages/mk/claims.json';
import sqClaims from '@/messages/sq/claims.json';
import srClaims from '@/messages/sr/claims.json';
import { MemberClaimMatterAllowanceCard } from './member-claim-matter-allowance-card';

const CATALOGS = { de: deClaims, en: enClaims, mk: mkClaims, sq: sqClaims, sr: srClaims } as const;
type Locale = keyof typeof CATALOGS;
const state = vi.hoisted(() => ({ locale: 'en' as string }));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const catalog = CATALOGS[state.locale as Locale] as Record<string, unknown>;
    const value = [...namespace.split('.'), key].reduce<unknown>(
      (node, segment) => (node as Record<string, unknown> | undefined)?.[segment],
      catalog
    );
    return typeof value === 'string' ? value : `MISSING:${namespace}.${key}`;
  },
}));

afterEach(cleanup);

const ALLOWANCE = {
  allowanceTotal: 2,
  consumedCount: 0,
  remainingCount: 2,
  windowStart: '2026-01-01T00:00:00.000Z',
  windowEnd: '2026-12-31T23:59:59.000Z',
};

describe('MemberClaimMatterAllowanceCard', () => {
  it.each(Object.keys(CATALOGS) as Locale[])(
    '%s states that only staff-accepted recovery cases count',
    locale => {
      state.locale = locale;
      render(<MemberClaimMatterAllowanceCard allowance={ALLOWANCE} />);

      const card = screen.getByTestId('member-claim-matter-allowance');
      expect(card).not.toHaveTextContent('MISSING:');
      expect(screen.getByTestId('member-claim-matter-allowance-hint').textContent).not.toBe('');
      expect(screen.getByTestId('member-claim-matter-allowance-used')).toHaveTextContent('0');
      expect(screen.getByTestId('member-claim-matter-allowance-remaining')).toHaveTextContent('2');
      expect(screen.getByTestId('member-claim-matter-allowance-total')).toHaveTextContent('2');
    }
  );

  it('no longer labels the count as every case used this year', () => {
    state.locale = 'sq';
    render(<MemberClaimMatterAllowanceCard allowance={ALLOWANCE} />);

    const card = screen.getByTestId('member-claim-matter-allowance');
    expect(card).not.toHaveTextContent('Përdorur këtë vit');
    expect(card).toHaveTextContent('Rikuperim i nisur');
    expect(card).toHaveTextContent(
      'Dorëzimi ose pranimi i rastit për shqyrtim nuk e përdor kuotën.'
    );
  });
});
