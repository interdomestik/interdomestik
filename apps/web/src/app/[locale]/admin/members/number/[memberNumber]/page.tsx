import { parseMemberNumber } from '@/features/admin/members/utils/memberNumber';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Roles allowed to access this resolver
const ALLOWED_ROLES = ['staff', 'branch_manager', 'tenant_admin'];

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

  // 1. Auth Guard (Staff/Admin only)
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    notFound(); // Return 404 for unauthorized (security by obscurity)
  }

  // 2. Validate Format (Fast fail)
  const parsed = parseMemberNumber(memberNumber);
  if (!parsed) {
    notFound();
  }

  // 3. Global Lookup
  // Member Number is unique (via Partial Index), so we expect at most one result.
  const foundUser = await db.query.user.findFirst({
    where: eq(user.memberNumber, memberNumber),
    columns: {
      id: true,
    },
  });

  if (!foundUser) {
    notFound();
  }

  // 4. Redirect to User Profile
  redirect(`/${locale}/admin/users/${foundUser.id}`);
}
