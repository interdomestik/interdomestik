import { MemberClaimDetailV2Page } from '@/features/member/claims/components/MemberClaimDetailV2Page';

interface PageProps {
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

export default async function ClaimDetailsPage({ params }: PageProps) {
  const { id, locale } = await params;
  return <MemberClaimDetailV2Page id={id} locale={locale} />;
}
