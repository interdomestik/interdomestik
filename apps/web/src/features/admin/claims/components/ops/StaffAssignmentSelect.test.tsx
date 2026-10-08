import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StaffAssignmentSelect } from './StaffAssignmentSelect';

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      ({ label: 'Assigned staff', placeholder: 'Select staff' })[key] ?? `${namespace}.${key}`,
}));

const STAFF = [
  { id: 'staff-1', name: 'Sara Staff', email: 'sara@example.test' },
  { id: 'staff-2', name: null, email: 'nameless@example.test' },
];

beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
  if (!('ResizeObserver' in globalThis)) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
});

function renderSelect(overrides: { staffOptions?: typeof STAFF; isPending?: boolean } = {}) {
  const onSelect = vi.fn();
  render(
    <StaffAssignmentSelect
      staffOptions={overrides.staffOptions ?? STAFF}
      isPending={overrides.isPending ?? false}
      onSelect={onSelect}
    />
  );
  return { onSelect, trigger: screen.getByRole('combobox', { name: 'Assigned staff' }) };
}

describe('StaffAssignmentSelect', () => {
  it('exposes a named combobox with no preselected target', () => {
    const { trigger, onSelect } = renderSelect();
    expect(trigger).toHaveTextContent('Select staff');
    expect(trigger).toBeEnabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('commits only the staff member chosen with the pointer', async () => {
    const user = userEvent.setup();
    const { trigger, onSelect } = renderSelect();
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'nameless@example.test' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('staff-2');
    expect(trigger).toHaveTextContent('Select staff');
  });

  it('allows retrying the same choice', async () => {
    const user = userEvent.setup();
    const { trigger, onSelect } = renderSelect();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await user.click(trigger);
      await user.click(await screen.findByRole('option', { name: 'Sara Staff' }));
    }
    expect(onSelect.mock.calls).toEqual([['staff-1'], ['staff-1']]);
  });

  it('opens from the keyboard and Escape closes without choosing', async () => {
    const user = userEvent.setup();
    const { trigger, onSelect } = renderSelect();
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(onSelect).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('selects a staff member with the keyboard', async () => {
    const user = userEvent.setup();
    const { trigger, onSelect } = renderSelect();
    trigger.focus();
    await user.keyboard('{Enter}');
    const first = await screen.findByRole('option', { name: 'Sara Staff' });
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('staff-1');
  });

  it('is disabled and busy while an assignment is pending', () => {
    const { trigger } = renderSelect({ isPending: true });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-busy', 'true');
  });

  it('is disabled with no options when no eligible staff exist', () => {
    const { trigger } = renderSelect({ staffOptions: [] });
    expect(trigger).toBeDisabled();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
