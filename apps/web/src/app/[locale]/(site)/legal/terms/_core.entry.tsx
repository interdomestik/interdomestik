import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.terms' });
  return {
    title: t('title'),
  };
}

export default function TermsPage() {
  const t = useTranslations('legal.terms'); // Ensure you have this namespace

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert">
        <p>{t('intro')}</p>

        <h2>1. Membership</h2>
        <p>{t('sections.membership')}</p>

        <h2>2. Services</h2>
        <p>{t('sections.services')}</p>

        <h2>3. Fees</h2>
        <p>{t('sections.fees')}</p>

        {/* Add more sections as needed */}
      </div>
    </div>
  );
}

export { generateViewport } from '@/app/_segment-exports';
