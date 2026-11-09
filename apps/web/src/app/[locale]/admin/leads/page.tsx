import { LeadDuplicatesLink } from '@/features/admin/lead-duplicates/components/LeadDuplicatesLink';
import { LeadDuplicatesPage } from '@/features/admin/lead-duplicates/components/LeadDuplicatesPage';
import VerificationOpsCenterPage from '@/features/admin/verification/components/v2/VerificationOpsCenterPage';
import { setRequestLocale } from 'next-intl/server';

type Props = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; query?: string; state?: string }>;
}>;

export default async function AdminLeadsPage({
  params,
  searchParams,
}: Props): Promise<React.JSX.Element> {
  const { locale } = await params;
  setRequestLocale(locale);

  const { view, state } = await searchParams;
  if (view === 'duplicates') {
    return (
      <LeadDuplicatesPage locale={locale} state={state === 'resolved' ? 'resolved' : 'pending'} />
    );
  }
  return (
    <>
      <LeadDuplicatesLink locale={locale} />
      <VerificationOpsCenterPage locale={locale} searchParams={searchParams} />
    </>
  );
}
