'use client';

import { updatePreferredLocale } from '@/actions/preferred-locale';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export function useSavePreferredLocale() {
  const t = useTranslations('common');

  return async (locale: string): Promise<boolean> => {
    const result = await updatePreferredLocale({ locale }).catch(() => null);
    if (result?.success) return true;

    toast.error(t('localeSaveError'));
    return false;
  };
}
