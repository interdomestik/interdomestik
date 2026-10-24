import {
  account,
  agentClients,
  auditLog,
  branches,
  claimMessages,
  claims,
  dbAdmin,
  memberNotes,
  session,
  user,
} from '@interdomestik/database';
import { and, eq, inArray } from 'drizzle-orm';

import { cleanupProfileChildren, type ProfileChildFixture } from './agent-profile-children.fixture';

/** Cleanup is confined to the generated IDs and runs every step after a partial setup failure. */
export async function cleanupAgentMessageFixture(args: {
  agent: { id: string; branchId: string };
  allClaimIds: string[];
  assignmentIds: string[];
  children: ProfileChildFixture;
  memberIds: string[];
  noteIds: string[];
  tenantId: string;
}) {
  const { agent, allClaimIds, assignmentIds, children, memberIds, noteIds, tenantId } = args;
  const cleanupSteps: Array<() => PromiseLike<unknown>> = [
    () =>
      dbAdmin
        .delete(auditLog)
        .where(
          and(
            eq(auditLog.tenantId, tenantId),
            eq(auditLog.action, 'claim.message_sent'),
            inArray(auditLog.entityId, allClaimIds)
          )
        ),
    () => dbAdmin.delete(claimMessages).where(inArray(claimMessages.claimId, allClaimIds)),
    () => dbAdmin.delete(claims).where(inArray(claims.id, allClaimIds)),
    () =>
      dbAdmin
        .delete(session)
        .where(inArray(session.userId, [memberIds[0], children.staffAuthorId])),
    () =>
      dbAdmin
        .delete(account)
        .where(inArray(account.userId, [memberIds[0], children.staffAuthorId])),
    () => cleanupProfileChildren(children),
    // Notes reference their authors without cascade, so remove them before users.
    () => dbAdmin.delete(memberNotes).where(inArray(memberNotes.id, noteIds)),
    () => dbAdmin.delete(agentClients).where(inArray(agentClients.id, assignmentIds)),
    () => dbAdmin.delete(user).where(inArray(user.id, memberIds)),
    () => dbAdmin.delete(session).where(eq(session.userId, agent.id)),
    () => dbAdmin.delete(account).where(eq(account.userId, agent.id)),
    () => dbAdmin.delete(user).where(eq(user.id, agent.id)),
    () => dbAdmin.delete(branches).where(eq(branches.id, agent.branchId)),
  ];
  let cleanupError: unknown;
  for (const cleanup of cleanupSteps) {
    try {
      await cleanup();
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (cleanupError) throw cleanupError;
}
