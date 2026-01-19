import {
  AgentClaimsProPage,
  AgentProClaim,
} from '@/features/agent/claims/components/AgentClaimsProPage';
import { auth } from '@/lib/auth';
import { claimMessages, claims, db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, count, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
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

  const claimIds = claimsData.map(c => c.id);
  const unreadMap = new Map<string, number>();
  const snippetMap = new Map<string, { content: string; createdAt: Date }>();

  if (claimIds.length > 0) {
    // 1. Fetch Unread Counts (incoming messages only)
    const unreadCounts = await db
      .select({
        claimId: claimMessages.claimId,
        count: count(claimMessages.id),
      })
      .from(claimMessages)
      .where(
        and(
          inArray(claimMessages.claimId, claimIds),
          isNull(claimMessages.readAt),
          ne(claimMessages.senderId, session.user.id)
        )
      )
      .groupBy(claimMessages.claimId);

    unreadCounts.forEach(row => unreadMap.set(row.claimId, row.count));

    // 2. Fetch Last Messages
    // Note: Drizzle distinctOn needs specific driver support or SQL check. PG supports it.
    const lastMessages = await db
      .selectDistinctOn([claimMessages.claimId], {
        claimId: claimMessages.claimId,
        content: claimMessages.content,
        createdAt: claimMessages.createdAt,
      })
      .from(claimMessages)
      .where(inArray(claimMessages.claimId, claimIds))
      .orderBy(claimMessages.claimId, desc(claimMessages.createdAt));

    lastMessages.forEach(row =>
      snippetMap.set(row.claimId, {
        content: row.content,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })
    );
  }

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
    // Add additional fields
    unreadCount: unreadMap.get(c.id) || 0,
    lastMessage: snippetMap.get(c.id)?.content || null,
    // Policy removed
    policy: null,
  }));

  return (
    <AgentClaimsProPage
      claims={mappedClaims}
      currentUser={{
        id: session.user.id,
        name: session.user.name,
        image: session.user.image ?? null,
        role: session.user.role || 'agent',
      }}
    />
  );
}
