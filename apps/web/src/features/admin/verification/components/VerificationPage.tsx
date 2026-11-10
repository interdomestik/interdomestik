import { getTranslations } from 'next-intl/server';
import { loadVerificationPageData } from '../server/verification-page-data';
import { VerificationList } from './VerificationList';

type Props = {
  searchParams: Promise<{ view?: string; query?: string }>;
};

export default async function VerificationPage({ searchParams }: Props) {
  const t = await getTranslations('admin.leads');
  const { view, query, leads, viewerRole } = await loadVerificationPageData(searchParams);

  return (
    <div className="container py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <VerificationList
        initialLeads={leads}
        initialParams={{ view, query }}
        viewerRole={viewerRole}
      />
    </div>
  );
}
