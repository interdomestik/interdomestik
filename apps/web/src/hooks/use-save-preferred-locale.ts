'use client';

import { updatePreferredLocale } from '@/actions/preferred-locale';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export function useSavePreferredLocale() {
  const t = useTranslations('common');

  return async (locale: string): Promise<'saved' | 'local-only' | 'failed'> => {
    const result = await updatePreferredLocale({ locale }).catch(() => null);
    if (result?.success) return 'saved';
    if (result?.code === 'profile_scope_unavailable') {
      toast.error(t('localeSwitchUnsaved'));
      return 'local-only';
    }

    toast.error(t('localeSaveError'));
    return 'failed';
  };
}
