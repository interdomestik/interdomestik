import { findMemberIdInTenantContext } from '@/features/admin/number-resolvers/tenant-context';
import { parseMemberNumber } from '@/features/admin/members/utils/memberNumber';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { ADMIN_ALLOWED_ROLES } from '@/lib/rbac-portals';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
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

  // The session's tenant authority (its effective access tenant); a session without tenant scope
  // throws here, before any lookup.
  const authorized = await authorizeSessionTenant(await headers());
  if (!authorized) {
    redirect(`/${locale}/login`);
  }
  const { session, authority } = authorized;
  const { tenantId } = readTenantAuthority(authority);
  const role = session.user.role ?? null;
  const branchId = session.user.branchId ?? null;

  const result = await getMemberNumberResolverCore({
    memberNumber,
    tenantId,
    role,
    branchId,
    allowedRoles: ADMIN_ALLOWED_ROLES,
    parseMemberNumber,
    inTenantContext: lookup => findMemberIdInTenantContext(authority, lookup),
  });

  if (!result.ok) {
    notFound();
  }

  redirect(`/${locale}/admin/users/${result.userId}`);
}
