import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

type PrivacyPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });
  return {
    title: t('title'),
  };
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.privacy' });

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert">
        <p>{t('intro')}</p>
        <h2>{t('sections.handling.title')}</h2>
        <p>{t('sections.handling.body')}</p>

        <h2>{t('sections.rights.title')}</h2>
        <p>{t('sections.rights.body')}</p>

        <h2>{t('sections.deletion.title')}</h2>
        <p>{t('sections.deletion.body')}</p>
        <code>POST /api/privacy/data-deletion</code>
        <code>{`{ "reason": "..." }`}</code>
        <p>{t('sections.deletion.followup')}</p>
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
