import { runNumberResolverInTenantContext } from '@/features/admin/number-resolvers/tenant-context';
import { parseMemberNumber } from '@/features/admin/members/utils/memberNumber';
import { auth } from '@/lib/auth';
import { ADMIN_ALLOWED_ROLES } from '@/lib/rbac-portals';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getMemberNumberResolverCore } from './_core';

interface ResolverPageProps {
  params: Promise<{
    locale: string;
    memberNumber: string;
  }>;
}

export default async function MemberNumberResolverPage({ params }: ResolverPageProps) {
  const { locale, memberNumber } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/${locale}/login`);
  }

  // Effective access tenant; a session without scope throws here, before any lookup.
  const tenantId = ensureTenantId(session);
  const role = session.user.role ?? null;
  const branchId = session.user.branchId ?? null;

  const result = await getMemberNumberResolverCore({
    memberNumber,
    tenantId,
    role,
    branchId,
    allowedRoles: ADMIN_ALLOWED_ROLES,
    parseMemberNumber,
    inTenantContext: lookup => runNumberResolverInTenantContext({ tenantId, role }, lookup),
  });

  if (!result.ok) {
    notFound();
  }

  redirect(`/${locale}/admin/users/${result.userId}`);
}
