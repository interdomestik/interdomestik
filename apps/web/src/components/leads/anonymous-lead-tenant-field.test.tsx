import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en/common.json';
import sq from '@/messages/sq/common.json';
import sr from '@/messages/sr/common.json';
import mk from '@/messages/mk/common.json';
import de from '@/messages/de/common.json';
import { AnonymousLeadTenantField } from './anonymous-lead-tenant-field';
vi.unmock('next-intl');
const roster = ['tenant_ks', 'tenant_mk', 'pilot-mk'] as const;
describe('anonymous classification field', () => {
  it.each(Object.entries({ en, sq, sr, mk, de }))(
    'labels the empty choice and distinct MK programmes in %s',
    (locale, messages) => {
      const onChoice = vi.fn();
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <form>
            <AnonymousLeadTenantField tenantOptions={roster} onChoice={onChoice} />
          </form>
        </NextIntlClientProvider>
      );
      const select = screen.getByLabelText(messages.common.anonymousLead.label);
      expect(select).toHaveValue('');
      expect(select).toBeRequired();
      select.focus();
      expect(select).toHaveFocus();
      expect(
        screen.getByRole('option', { name: messages.common.anonymousLead.tenants.tenant_mk })
      ).toHaveValue('tenant_mk');
      expect(
        screen.getByRole('option', { name: messages.common.anonymousLead.tenants['pilot-mk'] })
      ).toHaveValue('pilot-mk');
      fireEvent.change(select, { target: { value: 'pilot-mk' } });
      expect(onChoice).toHaveBeenCalledWith('pilot-mk');
    }
  );
  it('preserves every hint, exposes linked errors and disables while pending', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <form>
          <AnonymousLeadTenantField
            tenantOptions={roster}
            bookingHints={['tenant_mk', 'tenant_mk']}
            issue="conflict"
            disabled
          />
        </form>
      </NextIntlClientProvider>
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription(en.common.anonymousLead.conflict);
    expect(
      new FormData(container.querySelector('form')!).getAll('default_booking_tenant_id')
    ).toEqual(['tenant_mk', 'tenant_mk']);
  });
  it('shows unavailable when no active options exist', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AnonymousLeadTenantField />
      </NextIntlClientProvider>
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(en.common.anonymousLead.unavailable);
  });
});
