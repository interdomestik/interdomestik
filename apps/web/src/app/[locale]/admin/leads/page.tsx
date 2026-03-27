import VerificationOpsCenterPage from '@/features/admin/verification/components/v2/VerificationOpsCenterPage';
import { setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; query?: string }>;
};

export default async function AdminLeadsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <VerificationOpsCenterPage searchParams={searchParams} />;
}
