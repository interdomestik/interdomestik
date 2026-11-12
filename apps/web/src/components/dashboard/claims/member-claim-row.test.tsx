import { render, screen } from '@testing-library/react';
import { Table, TableBody } from '@interdomestik/ui';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import de from '@/messages/de/claims.json';
import { MemberClaimRow } from './member-claim-row';

vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }));

describe('member claim cards', () => {
  it.each([
    { locale: 'en', messages: en },
    { locale: 'sq', messages: sq },
    { locale: 'mk', messages: mk },
    { locale: 'sr', messages: sr },
    { locale: 'de', messages: de },
  ])('preserves all fields and one detail link in $locale', ({ locale, messages }) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Table>
          <TableBody>
            <MemberClaimRow
              locale={locale}
              formatCategory={() => 'Vehicle'}
              claim={{
                id: 'claim-1',
                title: 'Kërkesë për dëmshpërblim – Automjet',
                companyName: 'Company with a long name',
                category: 'auto',
                status: 'submitted',
                claimAmount: null,
                currency: 'EUR',
                createdAt: null,
                updatedAt: null,
              }}
            />
          </TableBody>
        </Table>
      </NextIntlClientProvider>
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/member/claims/claim-1');
    expect(link).toHaveClass('break-words', 'md:truncate');
    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(6);
    for (const [i, label] of ['company', 'category', 'status', 'amount', 'created'].entries()) {
      expect(cells[i + 1]).toHaveAttribute(
        'data-label',
        messages.claims.table[label as keyof typeof messages.claims.table]
      );
      expect(cells[i + 1]).toHaveClass('flex', 'md:table-cell', 'md:before:hidden');
    }
    expect(screen.getByText('Company with a long name')).toBeInTheDocument();
    expect(screen.getByText(messages.claims.status.submitted)).toBeInTheDocument();
    expect(cells[4]).toHaveTextContent('-');
    expect(cells[5]).toHaveTextContent('-');
  });
});
