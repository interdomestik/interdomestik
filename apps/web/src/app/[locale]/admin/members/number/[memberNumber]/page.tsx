import { parseMemberNumber } from '@/features/admin/members/utils/memberNumber';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { ADMIN_ALLOWED_ROLES } from '@/lib/rbac-portals';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getMemberNumberResolverCore } from './_core';

export const dynamic = 'force-dynamic';

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
    allowedRoles: [...ADMIN_ALLOWED_ROLES],
    db,
    parseMemberNumber,
  });

  if (!result.ok) {
    notFound();
  }

  redirect(`/${locale}/admin/users/${result.userId}`);
}
