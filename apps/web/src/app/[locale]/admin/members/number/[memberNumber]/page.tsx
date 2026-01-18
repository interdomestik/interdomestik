import { parseMemberNumber } from '@/features/admin/members/utils/memberNumber';
import { findMemberByNumber } from '@/features/admin/members.service';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Roles allowed to access this resolver
const ALLOWED_ROLES = ['tenant_admin', 'super_admin'];

interface ResolverPageProps {
  params: Promise<{
    locale: string;
    memberNumber: string;
  }>;
}

/**
 * Member Number Resolver Route
 *
 * Resolves MEM-YYYY-NNNNNN to the user profile page.
 * Protected: Staff/Admin only.
 */
export default async function MemberNumberResolverPage({ params }: ResolverPageProps) {
  const { locale, memberNumber } = await params;

  // 1. Auth Guard (Tenant/Super Admin only)
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    notFound(); // Return 404 for unauthorized (security by obscurity)
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    notFound();
  }

  // 2. Validate Format (Fast fail)
  const parsed = parseMemberNumber(memberNumber);
  if (!parsed) {
    notFound();
  }

  // 3. Global Lookup
  // Member Number is unique (via Partial Index), so we expect at most one result.
  const foundUser = await findMemberByNumber(memberNumber, tenantId);

  if (!foundUser) {
    notFound();
  }

  // 4. Redirect to User Profile
  redirect(`/${locale}/admin/users/${foundUser.id}`);
}
