import { auth } from '@/lib/auth';
import { canViewAdminClaims, resolveClaimsVisibility } from '@/features/admin/claims/server';
import { db } from '@/lib/db.server';
import { ensureTenantId } from '@interdomestik/shared-auth';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getClaimNumberResolverCore } from './_core';

interface Props {
  params: Promise<{
    locale: string;
    claimNumber: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, claimNumber } = await params;
  const t = await getTranslations({ locale, namespace: 'admin_claims' });

  return {
    title: `${t('claim')} ${claimNumber}`,
  };
}

export default async function ClaimNumberResolverPage({ params }: Props) {
  const { locale, claimNumber } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect(`/${locale}/login`);
  }
  const visibility = await resolveClaimsVisibility(session);
  if (!visibility || !canViewAdminClaims(visibility)) {
    notFound();
  }
  if (visibility.role === 'branch_manager' && !visibility.branchId) {
    notFound();
  }

  const tenantId = ensureTenantId(session);

  // Audit invariant: RESOLVER_TENANT_SCOPED (where: tenantId, claimNumber)

  const { claimId } = await getClaimNumberResolverCore({
    claimNumber,
    tenantId,
    db,
  });

  if (!claimId) {
    notFound();
  }

  redirect(`/${locale}/admin/claims/${claimId}?ref=${encodeURIComponent(claimNumber)}`);
}
