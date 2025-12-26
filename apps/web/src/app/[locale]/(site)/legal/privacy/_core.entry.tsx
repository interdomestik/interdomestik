import { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

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

export default function PrivacyPage() {
  const t = useTranslations('legal.privacy');

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert">
        <p>
          Your privacy is important to us. Included in your membership is strict data protection.
        </p>
        {/* Placeholder content */}
      </div>
    </div>
  );
}
