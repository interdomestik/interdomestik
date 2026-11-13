'use client';

import { BrandedNotFoundCopy } from '@/components/branded-not-found';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Localized not-found copy from the surrounding NextIntlClientProvider, which carries the route
 * locale and the `common` namespace. A server `getLocale()` in the not-found boundary could resolve
 * before the root layout's `setRequestLocale`, fall back to the default locale and cache that
 * request config for every later `getMessages()` (whole admin shell in Albanian, qa3 #67).
 */
export function LocaleNotFoundCopy(): React.JSX.Element {
  const locale = useLocale();
  const t = useTranslations('common.notFound');
  return (
    <BrandedNotFoundCopy
      homeHref={`/${locale}`}
      copy={{ title: t('title'), description: t('description'), backHome: t('backHome') }}
    />
  );
}
