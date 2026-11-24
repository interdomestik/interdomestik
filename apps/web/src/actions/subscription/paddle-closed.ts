import type { ActionError } from '@/lib/safe-action.types';
import { getTranslations } from 'next-intl/server';

export async function subscriptionClosedFailure() {
  const t = await getTranslations('membership');
  return { success: false, code: 'CLOSED', error: t('CLOSED') } as const satisfies ActionError;
}
