'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { getSessionSafe } from '@/components/shell/session';
import { LOCALES } from '@/i18n/locales';

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
  const result = await runAdminCrmForecastBackfillOperatorCore(
    { input, session },
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

function revalidateAdminCrmForAllLocales(): void {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/admin/crm`);
  }
}
