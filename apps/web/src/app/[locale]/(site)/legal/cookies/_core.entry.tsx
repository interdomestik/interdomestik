import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type CookiesPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.cookies' });
  return {
    title: t('title'),
  };
}

export default async function CookiesPage({ params }: CookiesPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.cookies' });

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert">
        <p>{t('intro')}</p>
        <p>{t('preference')}</p>
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
