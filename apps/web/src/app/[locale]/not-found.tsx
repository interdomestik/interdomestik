import { BrandedNotFound } from '@/components/branded-not-found';
import { getLocale, getTranslations } from 'next-intl/server';

export default async function NotFound(): Promise<React.JSX.Element> {
  const locale = await getLocale();
  const t = await getTranslations('common.notFound');
  return (
    <BrandedNotFound
      homeHref={`/${locale}`}
      copy={{
        title: t('title'),
        description: t('description'),
        backHome: t('backHome'),
      }}
    />
  );
}
