import { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

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

export default function CookiesPage() {
  const t = useTranslations('legal.cookies');

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert">
        <p>
          We use essential cookies to keep the portal secure and functional. Optional analytics
          cookies are enabled only after explicit consent.
        </p>
        <p>
          You can change your preference at any time by revisiting the cookie banner controls during
          your session.
        </p>
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
