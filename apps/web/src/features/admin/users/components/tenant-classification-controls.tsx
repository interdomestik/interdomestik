'use client';

import { resolveTenantClassification } from '@/actions/admin-users';
import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { AdminTenantOption } from '@/components/admin/admin-tenant-selector';

type TenantClassificationControlsProps = Readonly<{
  userId: string;
  currentTenantId: string;
  tenantClassificationPending: boolean;
  canReassignTenant: boolean;
  tenantOptions: AdminTenantOption[];
}>;

export function TenantClassificationControls({
  userId,
  currentTenantId,
  tenantClassificationPending,
  canReassignTenant,
  tenantOptions,
}: TenantClassificationControlsProps) {
  const t = useTranslations('admin.member_profile');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isHydrated, setIsHydrated] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(tenantOptions[0]?.id ?? '');

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const nextSearchParams = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    return params;
  }, [searchParams]);

  if (!tenantClassificationPending) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900"
        data-testid="tenant-classification-confirmed"
      >
        {t('tenant_resolution.confirmed')}
      </div>
    );
  }

  const submitResolution = async (targetTenantId: string | null) => {
    let result;
    try {
      result = await resolveTenantClassification({
        userId,
        currentTenantId,
        nextTenantId: targetTenantId,
      });
    } catch (error) {
      console.error('Failed to resolve tenant classification:', error);
      toast.error(tCommon('errors.generic'));
      return;
    }

    if (!result.success) {
      toast.error(result.error || tCommon('errors.generic'));
      return;
    }

    if (targetTenantId && targetTenantId !== currentTenantId) {
      const params = new URLSearchParams(nextSearchParams);
      params.set('tenantId', targetTenantId);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      toast.success(t('tenant_resolution.reassigned_success'));
      return;
    }

    router.refresh();
    toast.success(t('tenant_resolution.confirmed_success'));
  };

  const handleConfirm = () => {
    startTransition(async () => {
      await submitResolution(null);
    });
  };

  const handleReassign = () => {
    startTransition(async () => {
      if (!selectedTenantId) {
        toast.error(t('tenant_resolution.select_tenant_first'));
        return;
      }
      await submitResolution(selectedTenantId);
    });
  };

  return (
    <div
      className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm space-y-4"
      data-testid="tenant-classification-controls"
      data-hydrated={isHydrated ? 'true' : 'false'}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-amber-950">{t('tenant_resolution.title')}</h3>
        <p className="text-sm text-amber-900/80">{t('tenant_resolution.description')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={handleConfirm}
          disabled={isPending}
          data-testid="tenant-classification-confirm"
        >
          {t('tenant_resolution.confirm_current_tenant')}
        </Button>
      </div>

      {canReassignTenant && tenantOptions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1 text-sm" htmlFor="tenant-classification-reassign">
            <span className="block font-medium text-amber-950">
              {t('tenant_resolution.reassign_label')}
            </span>
            <select
              id="tenant-classification-reassign"
              className="h-10 w-full rounded-md border border-amber-200 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={selectedTenantId}
              onChange={event => setSelectedTenantId(event.target.value)}
              disabled={isPending}
              data-testid="tenant-classification-reassign-select"
            >
              {tenantOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name} ({option.countryCode})
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={handleReassign}
            disabled={isPending}
            data-testid="tenant-classification-reassign"
          >
            {t('tenant_resolution.reassign_tenant')}
          </Button>
        </div>
      )}

      {canReassignTenant && tenantOptions.length === 0 && (
        <p className="text-sm text-amber-900/80">{t('tenant_resolution.no_reassign_options')}</p>
      )}

      {!canReassignTenant && (
        <p className="text-xs text-amber-900/70">{t('tenant_resolution.reassign_locked')}</p>
      )}
    </div>
  );
}
