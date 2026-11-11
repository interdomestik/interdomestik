import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import common from '@/messages/en/common.json';
import categories from '@/messages/en/claimCategories.json';
import claims from '@/messages/en/claims.json';
const submit = vi.hoisted(() => vi.fn());
vi.unmock('next-intl');
vi.mock('@/actions/leads', () => ({ submitLead: submit }));
vi.mock('@/lib/analytics', () => ({ analytics: { track: vi.fn() } }));
import { CallMeNowDialog } from './call-me-now-dialog';

function openCallback(bookingHints: string[] = []) {
  render(
    <NextIntlClientProvider locale="en" messages={{ ...common, ...categories, ...claims }}>
      <CallMeNowDialog
        category="vehicle"
        tenantOptions={['tenant_ks', 'tenant_mk', 'pilot-mk']}
        bookingHints={bookingHints}
      />
    </NextIntlClientProvider>
  );
  fireEvent.click(
    screen.getByRole('button', { name: categories.claimCategories.callback.trigger })
  );
  fireEvent.change(screen.getByLabelText(categories.claimCategories.callback.name), {
    target: { value: 'Test Callback' },
  });
  fireEvent.change(screen.getByLabelText(categories.claimCategories.callback.phone), {
    target: { value: '123456789' },
  });
}

describe('unmounted callback component submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submit.mockResolvedValue({ success: false, error: 'Server details' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  it('keeps selected classification and values for retry and localizes failures', async () => {
    openCallback();
    fireEvent.change(screen.getByLabelText(common.common.anonymousLead.label), {
      target: { value: 'pilot-mk' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: categories.claimCategories.callback.submit })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      common.common.anonymousLead.submitError
    );
    expect(screen.queryByText('Server details')).toBeNull();
    expect(screen.getByLabelText(common.common.anonymousLead.label)).toHaveValue('pilot-mk');
    fireEvent.click(
      screen.getByRole('button', { name: categories.claimCategories.callback.submit })
    );
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit).toHaveBeenLastCalledWith({
      name: 'Test Callback',
      phone: '123456789',
      category: 'vehicle',
      classification: { choice: 'pilot-mk', bookingHints: [] },
    });
  });
  it('shows a linked conflict error before invoking the callback writer', async () => {
    openCallback(['pilot-mk']);
    fireEvent.change(screen.getByLabelText(common.common.anonymousLead.label), {
      target: { value: 'tenant_mk' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: categories.claimCategories.callback.submit })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      common.common.anonymousLead.conflict
    );
    expect(screen.getByLabelText(common.common.anonymousLead.label)).toHaveAccessibleDescription(
      common.common.anonymousLead.conflict
    );
    expect(submit).not.toHaveBeenCalled();
  });
});
