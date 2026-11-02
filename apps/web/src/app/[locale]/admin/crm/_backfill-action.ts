'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { getSessionSafe } from '@/components/shell/session';
import { LOCALES } from '@/i18n/locales';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';

import { runAdminCrmForecastBackfillOperatorCore } from './_backfill-core';
import type {
  AdminCrmForecastBackfillOperatorActionInput,
  AdminCrmForecastBackfillOperatorActionResult,
} from './_backfill-types';

export async function triggerCrmForecastSnapshotBackfill(
  input: AdminCrmForecastBackfillOperatorActionInput
): Promise<AdminCrmForecastBackfillOperatorActionResult> {
  const session = await getSessionSafe('AdminCrmForecastBackfillOperatorAction');
  const requestHeaders = await headers();
  const authority = await resolveSessionAuthority();
  const result = await runAdminCrmForecastBackfillOperatorCore(
    { authority, input, session },
    { headers: requestHeaders }
  );

  if (
    result.success &&
    result.result.mode === 'write' &&
    (result.result.status === 'completed' || result.result.status === 'partial')
  ) {
    revalidateAdminCrmForAllLocales();
  }

  return result;
}

async function resolveSessionAuthority() {
  try {
    return (await authorizeSessionTenant(await headers()))?.authority ?? null;
  } catch (error) {
    // A session without a tenant grants no authority, as it granted no actor before.
    if ((error as { name?: unknown } | null)?.name !== 'MissingTenantError') throw error;
    return null;
  }
}

function revalidateAdminCrmForAllLocales(): void {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/admin/crm`);
  }
}
