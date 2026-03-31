import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantClassificationControls } from './tenant-classification-controls';

const mocks = vi.hoisted(() => ({
  resolveTenantClassification: vi.fn(),
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/actions/admin-users', () => ({
  resolveTenantClassification: (...args: unknown[]) => mocks.resolveTenantClassification(...args),
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/en/admin/users/user-1',
  useRouter: () => ({
    replace: mocks.routerReplace,
    refresh: mocks.routerRefresh,
  }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tenantId=tenant_ks'),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('TenantClassificationControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTenantClassification.mockResolvedValue({ success: true });
  });

  it('hides resolution controls when the classification is already confirmed', () => {
    render(
      <TenantClassificationControls
        userId="user-1"
        currentTenantId="tenant_ks"
        tenantClassificationPending={false}
        canReassignTenant={false}
        tenantOptions={[]}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'tenant_resolution.confirm_current_tenant' })
    ).toBeNull();
  });

  it('confirms the current tenant and shows success feedback', async () => {
    render(
      <TenantClassificationControls
        userId="user-1"
        currentTenantId="tenant_ks"
        tenantClassificationPending
        canReassignTenant={false}
        tenantOptions={[]}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('tenant-classification-controls')).toHaveAttribute(
        'data-hydrated',
        'true'
      )
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'tenant_resolution.confirm_current_tenant' })
    );

    await waitFor(() =>
      expect(mocks.resolveTenantClassification).toHaveBeenCalledWith({
        userId: 'user-1',
        currentTenantId: 'tenant_ks',
        nextTenantId: null,
      })
    );
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it('allows super admins to reassign to an active tenant', async () => {
    render(
      <TenantClassificationControls
        userId="user-1"
        currentTenantId="tenant_ks"
        tenantClassificationPending
        canReassignTenant
        tenantOptions={[
          { id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK' },
          { id: 'tenant_al', name: 'Interdomestik (AL)', countryCode: 'AL' },
        ]}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('tenant-classification-controls')).toHaveAttribute(
        'data-hydrated',
        'true'
      )
    );

    fireEvent.change(screen.getByLabelText('tenant_resolution.reassign_label'), {
      target: { value: 'tenant_mk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'tenant_resolution.reassign_tenant' }));

    await waitFor(() =>
      expect(mocks.resolveTenantClassification).toHaveBeenCalledWith({
        userId: 'user-1',
        currentTenantId: 'tenant_ks',
        nextTenantId: 'tenant_mk',
      })
    );
    expect(mocks.routerReplace).toHaveBeenCalled();
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
  });

  it('shows an error toast when confirmation fails', async () => {
    mocks.resolveTenantClassification.mockResolvedValueOnce({ success: false, error: 'Boom' });

    render(
      <TenantClassificationControls
        userId="user-1"
        currentTenantId="tenant_ks"
        tenantClassificationPending
        canReassignTenant={false}
        tenantOptions={[]}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'tenant_resolution.confirm_current_tenant' })
    );

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Boom'));
  });
});
