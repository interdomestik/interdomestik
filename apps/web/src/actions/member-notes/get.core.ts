import { withTenantContext, type TenantTransaction } from '@interdomestik/database';
import { agentClients, memberNotes, user as userTable } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, desc, eq } from 'drizzle-orm';
import type { ActionResult, MemberNote } from '../member-notes.types';
import { canAccessNotes } from './access';
import type { Session } from './context';
import { mapNoteRow } from './map';

const AGENT_ROLE = 'agent';
const ACTIVE_AGENT_CLIENT_STATUS = 'active';

type MemberNotesReadOutcome = { kind: 'ok'; notes: MemberNote[] } | { kind: 'denied' };

type MemberNotesReadParams = {
  role: string;
  viewerId: string;
  tenantId: string;
  memberId: string;
};

/**
 * Member notes read model.
 * Validates the session role (agent/staff/admin) and tenant before any read, then performs the
 * whole read closure inside one tenant-context transaction. Agents are admitted only through an
 * active canonical agent_clients relationship for the member, established before any note is read.
 * Staff/admin keep tenant-scoped access. CRM notes (including internal ones) stay visible to admitted
 * viewers, matching existing behavior.
 */
export async function getMemberNotesCore(params: {
  session: NonNullable<Session> | null;
  memberId: string;
}): Promise<ActionResult<MemberNote[]>> {
  const { session, memberId } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };

  const role: unknown = session.user.role;
  if (typeof role !== 'string' || !canAccessNotes(role)) {
    return { success: false, error: 'Access denied' };
  }

  const rawViewerId: unknown = session.user.id;
  const viewerId = typeof rawViewerId === 'string' ? rawViewerId.trim() : '';
  if (role === AGENT_ROLE && !viewerId) {
    return { success: false, error: 'Access denied' };
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session).trim();
    if (!tenantId) throw new Error('Missing tenantId');
  } catch {
    return { success: false, error: 'Missing tenantId' };
  }

  try {
    const outcome = await withTenantContext({ tenantId, role }, tx =>
      readMemberNotes(tx, { role, viewerId, tenantId, memberId })
    );

    if (outcome.kind === 'denied') {
      return { success: false, error: 'Access denied' };
    }

    return { success: true, data: outcome.notes };
  } catch (error) {
    console.error('Error fetching notes:', error);
    return { success: false, error: 'Failed to fetch notes' };
  }
}

async function readMemberNotes(
  tx: TenantTransaction,
  params: MemberNotesReadParams
): Promise<MemberNotesReadOutcome> {
  const { role, viewerId, tenantId, memberId } = params;

  if (role === AGENT_ROLE) {
    const assignments = await tx
      .select({ id: agentClients.id })
      .from(agentClients)
      .where(
        and(
          eq(agentClients.tenantId, tenantId),
          eq(agentClients.agentId, viewerId),
          eq(agentClients.memberId, memberId),
          eq(agentClients.status, ACTIVE_AGENT_CLIENT_STATUS)
        )
      )
      .limit(1);

    if (assignments.length === 0) {
      return { kind: 'denied' };
    }
  }

  const rows = await tx
    .select({
      id: memberNotes.id,
      memberId: memberNotes.memberId,
      authorId: memberNotes.authorId,
      authorName: userTable.name,
      type: memberNotes.type,
      content: memberNotes.content,
      isPinned: memberNotes.isPinned,
      isInternal: memberNotes.isInternal,
      followUpDate: memberNotes.followUpDate,
      createdAt: memberNotes.createdAt,
      updatedAt: memberNotes.updatedAt,
    })
    .from(memberNotes)
    .leftJoin(userTable, eq(memberNotes.authorId, userTable.id))
    .where(
      and(
        eq(memberNotes.tenantId, tenantId), // SECURITY: Tenant scoping
        eq(memberNotes.memberId, memberId)
      )
    )
    .orderBy(desc(memberNotes.isPinned), desc(memberNotes.createdAt));

  return { kind: 'ok', notes: rows.map(mapNoteRow) };
}
