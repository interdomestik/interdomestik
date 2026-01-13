import { db } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isValidClaimNumber } from '@interdomestik/domain-claims/utils/claim-number';
import { ensureTenantId } from '@interdomestik/shared-auth';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

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

  const tenantId = ensureTenantId(session);
  const normalizedNumber = decodeURIComponent(claimNumber).trim().toUpperCase();

  // 1. Validate Format (Fast Fail)
  if (!isValidClaimNumber(normalizedNumber)) {
    // Optionally return a specific error page, but 404 is safer for security
    console.warn(`[Resolver] Invalid claim number format: ${normalizedNumber}`);
    notFound();
  }

  // 2. Lookup Claim
  const claim = await db.query.claims.findFirst({
    where: (c, { eq }) => withTenant(tenantId, c.tenantId, eq(c.claimNumber, normalizedNumber)),
    columns: {
      id: true,
    },
  });

  if (!claim) {
    console.warn(`[Resolver] Claim not found: ${normalizedNumber} in tenant ${tenantId}`);
    notFound();
  }

  // 3. Redirect to Canonical URL
  // We append ?ref=number to track source if needed, or just for UX
  redirect(`/${locale}/admin/claims/${claim.id}?ref=${normalizedNumber}`);
}
