import { MemberPoliciesV2Page } from '@/features/member/policies/components/MemberPoliciesV2Page';

export default async function PoliciesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return <MemberPoliciesV2Page locale={locale} />;
}
