'use client';

import { BrandedNotFound } from '@/components/branded-not-found';
import { useLocale, useTranslations } from 'next-intl';

// A client boundary on purpose: Next renders segment not-found elements alongside the layouts,
// so a server `getLocale()` here could resolve before the root layout's `setRequestLocale` ran,
// fall back to the default locale and cache that request config for every later
// `getMessages()` call (the whole admin shell rendered in Albanian on /en|sr|mk|de). The
// surrounding NextIntlClientProvider already carries the route locale and `common` messages.
export default function NotFound(): React.JSX.Element {
  const locale = useLocale();
  const t = useTranslations('common.notFound');
  return (
    <BrandedNotFound
      homeHref={`/${locale}`}
      scope="locale"
      copy={{
        title: t('title'),
        description: t('description'),
        backHome: t('backHome'),
      }}
    />
  );
}
