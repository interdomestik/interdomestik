import { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal.refund' });
  return {
    title: t('title'),
  };
}

export default function RefundPage() {
  const t = useTranslations('legal.refund');

  return (
    <div className="container py-20 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
      <div className="prose dark:prose-invert">
        <p>30-Day Money-Back Guarantee</p>
        <p>
          If you are not satisfied with your membership within the first 30 days, we will provide a
          full refund. Please contact support@interdomestik.com
        </p>
      </div>
    </div>
  );
}
