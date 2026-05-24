import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OpsFiltersBar } from './OpsFiltersBar';
import { OPS_TEST_IDS } from './testids';

vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: PropsWithChildren<ComponentProps<'button'> & { asChild?: boolean }>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
}));

describe('OpsFiltersBar', () => {
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
  ];

  it('keeps the active non-link tab inert', () => {
    const onTabChange = vi.fn();

    render(
      <OpsFiltersBar
        tabs={tabs}
        activeTab="all"
        onTabChange={onTabChange}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
      />
    );

    const allTab = screen.getByTestId('ops-tab-all');
    expect(allTab).toBeDisabled();

    fireEvent.click(allTab);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('keeps inactive non-link tabs clickable when not pending', () => {
    const onTabChange = vi.fn();

    render(
      <OpsFiltersBar
        tabs={tabs}
        activeTab="all"
        onTabChange={onTabChange}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
      />
    );

    fireEvent.click(screen.getByTestId('ops-tab-active'));
    expect(onTabChange).toHaveBeenCalledWith('active');
  });

  it('renders the structural wrapping contract for tabs, search, and actions', () => {
    render(
      <OpsFiltersBar
        tabs={tabs}
        activeTab="all"
        onTabChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
        rightActions={<div data-testid="right-actions">Actions</div>}
      />
    );

    expect(screen.getByTestId(OPS_TEST_IDS.FILTERS.TABS)).toHaveClass('flex-wrap');
    expect(screen.getByTestId(OPS_TEST_IDS.FILTERS.TABS)).toHaveClass('w-full');
    expect(screen.getByTestId(OPS_TEST_IDS.FILTERS.ACTIONS)).toHaveClass('flex-wrap');
    expect(screen.getByTestId(OPS_TEST_IDS.FILTERS.ACTIONS)).toHaveClass('w-full');
    expect(screen.getByTestId(OPS_TEST_IDS.FILTERS.SEARCH_GROUP)).toHaveClass('min-w-0');
  });

  it('keeps active link tabs inert without removing their href', () => {
    const onTabChange = vi.fn();

    render(
      <OpsFiltersBar
        tabs={[
          { id: 'all', label: 'All', href: '/ops?tab=all' },
          { id: 'active', label: 'Active', href: '/ops?tab=active' },
        ]}
        activeTab="all"
        onTabChange={onTabChange}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
      />
    );

    const activeTab = screen.getByTestId('ops-tab-all');
    expect(activeTab).toHaveAttribute('href', '/ops?tab=all');
    expect(activeTab).toHaveAttribute('aria-disabled', 'true');
    expect(activeTab).toHaveAttribute('tabindex', '-1');

    fireEvent.click(activeTab);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('keeps pending link tabs inert without removing their href', () => {
    const onTabChange = vi.fn();

    render(
      <OpsFiltersBar
        tabs={[
          { id: 'all', label: 'All', href: '/ops?tab=all' },
          { id: 'active', label: 'Active', href: '/ops?tab=active' },
        ]}
        activeTab="all"
        onTabChange={onTabChange}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchPlaceholder="Search..."
        isPending
      />
    );

    const inactivePendingTab = screen.getByTestId('ops-tab-active');
    expect(inactivePendingTab).toHaveAttribute('href', '/ops?tab=active');
    expect(inactivePendingTab).toHaveAttribute('aria-disabled', 'true');
    expect(inactivePendingTab).toHaveAttribute('tabindex', '-1');

    fireEvent.click(inactivePendingTab);
    expect(onTabChange).not.toHaveBeenCalled();
  });
});
