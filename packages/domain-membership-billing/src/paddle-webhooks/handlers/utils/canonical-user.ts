import { authorizePaddleTenant, resolvePaddleUserOwner } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type PaddleCanonicalUser = {
  id: string;
  tenantId: string;
  agentId: string | null;
  email: string;
  name: string;
  memberNumber: string | null;
};

export type PaddleCanonicalUserLookup = {
  user: PaddleCanonicalUser;
  /** The `paddle-webhook` authority minted from the resolver-produced owner of this user. */
  authority: TenantAuthority;
};

/**
 * Loads the canonical user named by a Paddle event (customData userId) inside the user's own tenant.
 * The privileged lookup only maps the exact id to its tenant; the owner it returns is authorized
 * with the verified delivery and the profile is read under that authority. Callers keep their
 * subscription/tenant/customData conflict checks and reuse the returned authority for later effects
 * on the same tenant.
 */
export async function readPaddleCanonicalUser(
  delivery: IngressCapability<'paddle-delivery'>,
  userId: string
): Promise<PaddleCanonicalUserLookup | null> {
  const owner = await resolvePaddleUserOwner(userId);
  if (!owner) return null;

  const authority = authorizePaddleTenant(delivery, owner);
  const { tenantId } = readTenantAuthority(authority);
  const record = await withTenantAuthority(authority, tx =>
    tx.query.user.findFirst({
      where: (users, { and, eq }) => and(eq(users.id, owner.userId), eq(users.tenantId, tenantId)),
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
  if (!record) return null;
  if (record.tenantId !== tenantId) {
    throw new Error(
      `Paddle user ${record.id} tenant conflict: record=${record.tenantId} authority=${tenantId}`
    );
  }
  return { user: record, authority };
}
