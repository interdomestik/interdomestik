import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'dashboard.home_grid' });
  return (
    <div className="container py-8" data-testid="benefits-page-ready">
      <h1 className="text-2xl font-bold mb-4">{t('cta_benefits')}</h1>
      <p>Placeholder content.</p>
    </div>
  );
}
