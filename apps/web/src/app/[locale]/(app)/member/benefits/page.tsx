import { useTranslations } from 'next-intl';

export default function Page() {
  const t = useTranslations('dashboard.home_grid');
  return (
    <div className="container py-8" data-testid="benefits-page-ready">
      <h1 className="text-2xl font-bold mb-4">{t('cta_benefits')}</h1>
      <p>Placeholder content.</p>
    </div>
  );
}
