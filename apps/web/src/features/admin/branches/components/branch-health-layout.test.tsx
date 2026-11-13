import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import sq from '@/messages/sq/admin-branches.json';
import mk from '@/messages/mk/admin-branches.json';
import { BranchHealthCard } from './branch-health-card';
import { BranchHealthFilters } from './branch-health-filters';

vi.unmock('next-intl');
vi.mock('@/i18n/routing', () => ({ Link: (props: ComponentProps<'a'>) => <a {...props} /> }));

describe('branch layout', () => {
  it.each([
    { locale: 'sq', messages: sq },
    { locale: 'mk', messages: mk },
  ])(
    'wraps controls and displays full names and unbroken badges in $locale',
    ({ locale, messages }) => {
      const branch = {
        id: 'branch',
        code: 'KS-A',
        name: 'KS Branch Prishtina – Qendra kryesore',
        isActive: true,
        kpis: { openClaims: 20, cashPending: 0, slaBreaches: 0 },
      };
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <BranchHealthFilters
            filters={{ search: '', status: 'all', needsAttention: false, sortBy: 'name_asc' }}
            onFilterChange={vi.fn()}
          />
          <BranchHealthCard branch={branch} onEdit={vi.fn()} onDelete={vi.fn()} />
        </NextIntlClientProvider>
      );
      const name = screen.getByRole('heading', { name: branch.name });
      expect(name).not.toHaveClass('truncate');
      expect(name).toHaveClass('break-words');
      expect(name.parentElement).toHaveClass('flex-col', 'items-start');
      expect(name.nextElementSibling).toHaveClass('whitespace-nowrap', '[overflow-wrap:normal]');
      expect(screen.getByTestId('branch-card-KS-A')).toHaveClass('min-w-0');
      const sort = screen.getByRole('combobox');
      expect(sort).toHaveClass('max-w-full');
      expect(sort.parentElement).toHaveClass('flex-wrap', 'max-w-full');
      expect(screen.getByTestId('ops-filters-bar')).toHaveClass('sm:flex-wrap');
    }
  );
});
