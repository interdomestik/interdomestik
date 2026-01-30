import { getTranslations } from 'next-intl/server';

export default async function GuidesPlaceholder({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'agent-toolkit' });

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] space-y-4"
      data-testid="page-ready"
    >
      <h1 className="text-4xl font-black tracking-tight">{t('guides.title')}</h1>
      <div className="flex gap-2">
        {['DE', 'CH', 'AT', 'IT', 'Të tjera'].map(country => (
          <div
            key={country}
            data-testid={`agent-guides-country-${country}`}
            className="px-4 py-2 rounded-full border border-white/10 bg-white/5 text-sm font-medium"
          >
            {country}
          </div>
        ))}
      </div>
      <p className="text-muted-foreground">{t('coming_soon')}</p>
    </div>
  );
}
