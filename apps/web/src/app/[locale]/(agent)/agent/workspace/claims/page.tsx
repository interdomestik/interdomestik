import {
  AgentClaimsProPage,
  AgentProClaim,
} from '@/features/agent/claims/components/AgentClaimsProPage';
import { auth } from '@/lib/auth';
import { claims, db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentWorkspaceClaimsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/login');
  }

  const tenantId = ensureTenantId(session);

  // Fetch Claims for Agent's Tenant
  const claimsData = await db.query.claims.findMany({
    where: eq(claims.tenantId, tenantId),
    orderBy: [desc(claims.createdAt)],
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
      branch: {
        columns: {
          name: true,
        },
      },
      // Removed Policy relation as it does not exist on claims
    },
    limit: 100,
  });

  // Map to stricter type. Using any for intermediate row to bypass Drizzle inference quirks.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedClaims: AgentProClaim[] = claimsData.map((c: any) => ({
    id: c.id,
    claimNumber: c.claimNumber ?? 'N/A',
    status: c.status ?? 'draft',
    createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
    updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
    member: c.user
      ? {
          id: c.user.id,
          name: c.user.name ?? '',
          email: c.user.email,
        }
      : null,
    branch: c.branch
      ? {
          name: c.branch.name,
        }
      : null,
    // Policy removed
    policy: null,
  }));

  return <AgentClaimsProPage claims={mappedClaims} userId={session.user.id} />;
}
