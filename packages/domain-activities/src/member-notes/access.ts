import { agentClients, and, eq, user, type TenantTransaction } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityDescriptor,
} from '@interdomestik/database/tenant-authority';
import { ROLES } from '@interdomestik/shared-auth';
import { ensureTenantId, type SessionWithTenant } from '@interdomestik/shared-auth/session';

// Who may read and write member notes (R-16: the rule lives here, not in the entry points).
// Deny by default: only the roles named below pass, and each check runs before any read.

export type MemberNoteSession = {
  user: {
    id: string;
    role?: string | null;
    tenantId?: string | null;
    accessTenantId?: string | null;
  };
};

export type MemberNoteActor = Readonly<{ tenantId: string; userId: string; role: string }>;

function descriptorOf(authority: TenantAuthority): TenantAuthorityDescriptor | null {
  try {
    return readTenantAuthority(authority);
  } catch {
    // An unknown or expired authority is no authority.
    return null;
  }
}

function effectiveTenantOf(session: MemberNoteSession): string | null {
  try {
    return ensureTenantId(session as SessionWithTenant);
  } catch {
    return null;
  }
}

/**
 * The actor of a member-note command: the authority's principal, bound to the session it was
 * minted from. Refused (null) unless the authority is a session authority whose tenant and access
 * tenant equal the session's effective tenant, and whose principal names the session's user with
 * exactly the session's role (a padded session role is refused).
 */
export function memberNoteActorOf(
  session: MemberNoteSession,
  authority: TenantAuthority
): MemberNoteActor | null {
  const descriptor = descriptorOf(authority);
  if (!descriptor || descriptor.purpose !== 'session') return null;
  const sessionTenant = effectiveTenantOf(session);
  if (
    !sessionTenant ||
    sessionTenant !== descriptor.tenantId ||
    sessionTenant !== descriptor.accessTenantId
  ) {
    return null;
  }
  const { principal } = descriptor;
  if (!principal?.role || principal.userId !== session.user.id) return null;
  if (principal.role !== session.user.role) return null;
  return Object.freeze({
    tenantId: descriptor.tenantId,
    userId: principal.userId,
    role: principal.role,
  });
}

/** tenant: any member of the tenant; assigned: members actively assigned to the agent. */
export type MemberNoteScope = 'tenant' | 'assigned' | 'denied';

/**
 * The base allow-list, unchanged: agent, staff and admin. Branch managers see no note content
 * (owner decision of 2026-11-17); tenant_admin, super_admin and every other role stay denied.
 */
export function memberNoteScope(role: string): MemberNoteScope {
  if (role === ROLES.agent) return 'assigned';
  if (role === ROLES.staff || role === ROLES.admin) return 'tenant';
  return 'denied';
}

/** A note is about a member account: `member`, or `user`, the legacy default member role. */
function isMemberAccountRole(role: string | null | undefined): boolean {
  return role === ROLES.member || role === 'user';
}

/**
 * Whether the actor may act on this member's notes, decided inside the command's transaction.
 * Lock order: the member row (FOR SHARE), then the agent's active assignment (FOR SHARE), so a
 * reassignment, revocation or deletion waits for the command and the next command sees it (R-17).
 * The member's referring agent (`user.agentId`) grants nothing: only an active assignment does.
 */
export async function canActOnMemberNotes(
  tx: TenantTransaction,
  actor: MemberNoteActor,
  memberId: string
): Promise<boolean> {
  const scope = memberNoteScope(actor.role);
  if (scope === 'denied') return false;

  const [target] = await tx
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(and(eq(user.id, memberId), eq(user.tenantId, actor.tenantId)))
    .for('share');
  if (!target || !isMemberAccountRole(target.role)) return false;
  if (scope === 'tenant') return true;

  const assignments = await tx
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(
      and(
        eq(agentClients.tenantId, actor.tenantId),
        eq(agentClients.agentId, actor.userId),
        eq(agentClients.memberId, memberId),
        eq(agentClients.status, 'active')
      )
    )
    .for('share');
  return assignments.length > 0;
}
