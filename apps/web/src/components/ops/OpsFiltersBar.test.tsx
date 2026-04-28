import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OpsFiltersBar } from './OpsFiltersBar';

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
});
