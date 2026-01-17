import { StaffClaimDetailV2Page } from '@/features/staff/claims/components/StaffClaimDetailV2Page';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function StaffClaimDetailsPage({ params }: PageProps) {
  const { id, locale } = await params;
  return <StaffClaimDetailV2Page id={id} locale={locale} />;
}
