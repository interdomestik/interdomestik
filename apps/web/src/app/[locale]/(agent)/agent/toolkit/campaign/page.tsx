import { getTranslations } from 'next-intl/server';

export default async function CampaignPlaceholder({
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
      <h1 className="text-4xl font-black tracking-tight">{t('campaign.title')}</h1>
      <p className="text-muted-foreground">{t('coming_soon')}</p>
    </div>
  );
}
