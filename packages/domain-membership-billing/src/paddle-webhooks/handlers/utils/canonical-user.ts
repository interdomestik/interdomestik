import { withTenantContext } from '@interdomestik/database';
import { resolvePaddleUserOwner } from '@interdomestik/database/paddle-provider-resolution';

export type PaddleCanonicalUser = {
  id: string;
  tenantId: string;
  agentId: string | null;
  email: string;
  name: string;
  memberNumber: string | null;
};

/**
 * Loads the canonical user named by a Paddle event (customData userId) inside the user's own tenant.
 * The privileged lookup only maps the exact id to its tenant; the profile is read under RLS. Callers
 * keep their subscription/tenant/customData conflict checks.
 */
export async function readPaddleCanonicalUser(userId: string): Promise<PaddleCanonicalUser | null> {
  const owner = await resolvePaddleUserOwner(userId);
  if (!owner) return null;

  const record = await withTenantContext({ tenantId: owner.tenantId }, tx =>
    tx.query.user.findFirst({
      where: (users, { and, eq }) =>
        and(eq(users.id, owner.userId), eq(users.tenantId, owner.tenantId)),
      columns: {
        id: true,
        tenantId: true,
        agentId: true,
        email: true,
        name: true,
        memberNumber: true,
      },
    })
  );
  return record ?? null;
}
