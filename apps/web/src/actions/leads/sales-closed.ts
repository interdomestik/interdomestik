import 'server-only';

import { actionFailure } from '@/lib/safe-action.failure';
import { SalesClosedError } from '@interdomestik/database/pilot-switch';
import { getTranslations } from 'next-intl/server';

export async function leadSalesClosedFailure(error: unknown) {
  if (!(error instanceof SalesClosedError)) {
    throw error;
  }
  const t = await getTranslations('pricing');
  return actionFailure(error.code, t('CLOSED'));
}
