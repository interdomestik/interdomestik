import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en/admin-branches.json';
import { BranchHealthCard } from './branch-health-card';
import { BranchHealthFilters, type BranchFiltersState } from './branch-health-filters';
import { BranchHealthView } from './branch-health-view';

vi.mock('@/i18n/routing', () => ({ Link: 'a' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/actions/admin-rbac', () => ({ deleteBranch: vi.fn() }));
vi.mock('@/components/admin/branches/edit-branch-sheet', () => ({ EditBranchSheet: () => null }));
const copy = messages.admin.branches;

describe('branch list presentation', () => {
  it('preserves the existing empty result and filters inside the shared control surface', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BranchHealthView initialBranches={[]} />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(copy.no_branches)).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('data-workspace-controls');
  });

  it('keeps the complete branch identity, dashboard link and visible menu control', () => {
    const name = 'Branch'.repeat(60);
    const code = 'CODE'.repeat(30);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BranchHealthCard
          branch={{
            id: 'branch-a',
            name,
            code,
            isActive: true,
            kpis: { openClaims: 0, cashPending: 0, slaBreaches: 0 },
          }}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole('heading', { name })).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByText(code)).toHaveTextContent(code);
    expect(screen.getByRole('link', { name: copy.view_dashboard })).toHaveAttribute(
      'href',
      '/admin/branches/branch-a'
    );
    expect(screen.getByRole('button', { name: copy.actions.open })).toHaveClass('size-11');
  });

  it('retains search, status and attention filter interactions inside wrapping controls', () => {
    const onFilterChange = vi.fn();
    const filters: BranchFiltersState = {
      search: '',
      status: 'all',
      needsAttention: false,
      sortBy: 'name_asc',
    };
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BranchHealthFilters filters={filters} onFilterChange={onFilterChange} />
      </NextIntlClientProvider>
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'branch-a' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ ...filters, search: 'branch-a' });
    fireEvent.click(screen.getByRole('button', { name: copy.status.inactive }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ ...filters, status: 'inactive' });
    fireEvent.click(screen.getByRole('checkbox', { name: copy.filter_attention }));
    expect(onFilterChange).toHaveBeenLastCalledWith({ ...filters, needsAttention: true });
    expect(screen.getByRole('combobox', { name: copy.sort_label })).toHaveClass(
      'min-h-11',
      'max-w-full'
    );
  });
});
