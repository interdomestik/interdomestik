import { RightsContent } from '@/components/dashboard/rights/rights-content';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'consumerRights' });
  return {
    title: t('title'),
    description: t('intro'),
  };
}

export default function RightsPage() {
  return <RightsContent />;
}
