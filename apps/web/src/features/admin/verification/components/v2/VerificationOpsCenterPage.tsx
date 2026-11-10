import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { GlassCard } from '@/components/ui/glass-card';
import { getTranslations } from 'next-intl/server';
import { loadVerificationPageData } from '../../server/verification-page-data';
import { VerificationOpsCenterClient } from './VerificationOpsCenterClient';

type Props = {
  locale: string;
  searchParams: Promise<{ view?: string; query?: string }>;
};

export default async function VerificationOpsCenterPage({
  searchParams,
  locale,
}: Readonly<Props>): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'admin.leads' });
  const { view, query, leads, viewerRole } = await loadVerificationPageData(searchParams);

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-testid="verification-ops-page">
      <AdminPageHeader title={t('title')} subtitle={t('subtitle')} />

      <GlassCard className="p-6">
        <VerificationOpsCenterClient
          initialData={leads}
          initialParams={{ view, query }}
          viewerRole={viewerRole}
        />
      </GlassCard>
    </div>
  );
}
