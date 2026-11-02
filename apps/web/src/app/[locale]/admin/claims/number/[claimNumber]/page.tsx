import { canViewAdminClaims, resolveClaimsVisibility } from '@/features/admin/claims/server';
import { runNumberResolverInTenantContext } from '@/features/admin/number-resolvers/tenant-context';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
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
  // The session's tenant authority (its effective access tenant); a session without tenant scope
  // throws here, before any lookup.
  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    redirect(`/${locale}/login`);
  }
  const { session, authority } = authorized;
  const visibility = await resolveClaimsVisibility(session);
  if (!visibility || !canViewAdminClaims(visibility)) {
    notFound();
  }
  if (visibility.role === 'branch_manager' && !visibility.branchId) {
    notFound();
  }

  // Audit invariant: RESOLVER_TENANT_SCOPED (where: tenantId, claimNumber)

  const { claimId } = await getClaimNumberResolverCore({
    claimNumber,
    visibility,
    inTenantContext: lookup => runNumberResolverInTenantContext(authority, lookup),
  });

  if (!claimId) {
    notFound();
  }

  redirect(`/${locale}/admin/claims/${claimId}?ref=${encodeURIComponent(claimNumber)}`);
}
