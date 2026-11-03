import { authorizePaddleTenant, resolvePaddleCustomerEmailOwner } from '@interdomestik/database';
import type { IngressCapability } from '@interdomestik/database/ingress';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import type { ReconciledUserRecord } from './reconcile-checkout-user';

export function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function shouldPromoteRole(role: string | null | undefined): boolean {
  return !role || role === 'user' || role === 'member';
}

export function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === '23505'
  );
}

/**
 * Global email ownership: the privileged probe names the owning user/tenant (or reports ambiguity),
 * and the full record is read inside that owner's tenant. Ambiguity is a conflict.
 */

export async function findUserByEmail(
  delivery: IngressCapability<'paddle-delivery'>,
  email: string
): Promise<ReconciledUserRecord | null | 'ambiguous'> {
  const owner = await resolvePaddleCustomerEmailOwner(email);
  if (owner === 'ambiguous' || !owner) return owner;

  const userRecord = await withTenantAuthority(authorizePaddleTenant(delivery, owner), tx =>
    tx.query.user.findFirst({
      where: (users, { and, eq }) =>
        and(eq(users.id, owner.userId), eq(users.tenantId, owner.tenantId)),
      columns: {
        id: true,
        tenantId: true,
        branchId: true,
        email: true,
        name: true,
        role: true,
        memberNumber: true,
        agentId: true,
        createdBy: true,
        assistedByAgentId: true,
      },
    })
  );
  // The owner was resolved but is not visible in its tenant: treat as a conflict, never as absent.
  return userRecord ?? 'ambiguous';
}
