import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpsTable } from './OpsTable';

vi.mock('@interdomestik/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));

const columns = [{ key: 'name', header: 'Name' }];

describe('OpsTable scroll region', () => {
  it('makes a labelled scroll region keyboard focusable even when it has no rows', async () => {
    render(<OpsTable columns={columns} rows={[]} emptyLabel="Nothing yet" scrollLabel="Claims" />);
    const region = screen.getByRole('region', { name: 'Claims' });
    expect(region).toHaveAttribute('tabindex', '0');
    await userEvent.setup().tab();
    expect(region).toHaveFocus();
  });

  it('keeps the unlabelled table wrapper unfocusable and out of the landmark tree', () => {
    render(<OpsTable columns={columns} rows={[]} emptyLabel="Nothing yet" />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('table').parentElement?.parentElement).not.toHaveAttribute('tabindex');
  });
});
