import { parseMemberNumber } from '@/features/admin/members/utils/memberNumber';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getMemberNumberResolverCore } from './_core';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['tenant_admin', 'super_admin'];

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

  const result = await getMemberNumberResolverCore({
    memberNumber,
    tenantId: session.user.tenantId,
    role: session.user.role,
    allowedRoles: ALLOWED_ROLES,
    db,
    parseMemberNumber,
  });

  if (!result.ok) {
    notFound();
  }

  const tenantId = session.user.tenantId;
  const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  redirect(`/${locale}/admin/users/${result.userId}${query}`);
}
