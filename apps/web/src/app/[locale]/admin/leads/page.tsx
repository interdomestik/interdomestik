import { LeadDuplicatesPage } from '@/features/admin/lead-duplicates/components/LeadDuplicatesPage';
import VerificationOpsCenterPage from '@/features/admin/verification/components/v2/VerificationOpsCenterPage';
import { setRequestLocale } from 'next-intl/server';

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; query?: string; state?: string }>;
}>;

export default async function AdminLeadsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { view, state } = await searchParams;
  if (view === 'duplicates') {
    return <LeadDuplicatesPage state={state === 'resolved' ? 'resolved' : 'pending'} />;
  }
  return <VerificationOpsCenterPage searchParams={searchParams} />;
}
