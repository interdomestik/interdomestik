'use client';

import { useTranslations } from 'next-intl';
import { Toaster } from 'sonner';

export function LocalizedToaster(): React.JSX.Element {
  const t = useTranslations('common');
  return <Toaster position="top-right" richColors containerAriaLabel={t('toastRegion')} />;
}
