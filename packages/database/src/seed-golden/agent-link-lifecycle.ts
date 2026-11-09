import {
  E2E_AGENT_LINK_LIFECYCLE_FIXTURES,
  E2E_AGENT_LINK_LIFECYCLE_INSTANTS,
  E2E_AGENT_LINK_LIFECYCLE_PAIR,
  type E2EAgentLinkLifecycleKey,
} from '../e2e-agent-link-lifecycle-fixtures';
import { E2E_CASH_STATES_BRANCH } from '../e2e-cash-fixtures';
import { E2E_USER_IDS } from '../e2e-role-fixtures';
import { E2E_USERS } from '../e2e-users';
import { excludedSet } from '../seed-utils/excluded-set';
import type { SeedGoldenContext } from './types';

export function buildAgentLinkLifecycleUserToSeed() {
  const fixture = E2E_USERS.KS_MEMBER_LINK_LIFECYCLE;
  return {
    id: E2E_USER_IDS.KS_MEMBER_LINK_LIFECYCLE,
    name: fixture.name,
    email: fixture.email,
    role: fixture.dbRole,
    tenantId: fixture.tenantId,
    branchId: E2E_CASH_STATES_BRANCH.id,
  };
}

export function buildAgentLinkLifecycleRow(key: E2EAgentLinkLifecycleKey = 'REACTIVATED') {
  const fixture = E2E_AGENT_LINK_LIFECYCLE_FIXTURES[key];
  return {
    ...E2E_AGENT_LINK_LIFECYCLE_PAIR,
    status: fixture.status,
    joinedAt: new Date(E2E_AGENT_LINK_LIFECYCLE_INSTANTS.ACTIVE),
    createdAt: new Date(E2E_AGENT_LINK_LIFECYCLE_INSTANTS.ACTIVE),
  };
}

/** Synthetic fixture history, not evidence that the production mutation path ran. */
export function buildAgentLinkLifecycleHistoryToSeed() {
  return Object.entries(E2E_AGENT_LINK_LIFECYCLE_FIXTURES).map(([key, fixture]) => ({
    id: fixture.auditId,
    tenantId: E2E_AGENT_LINK_LIFECYCLE_PAIR.tenantId,
    actorId: E2E_USER_IDS.KS_ADMIN,
    actorRole: E2E_USERS.KS_ADMIN.dbRole,
    action: 'seed.agent_link_lifecycle',
    entityType: 'agent_client',
    entityId: E2E_AGENT_LINK_LIFECYCLE_PAIR.id,
    metadata: {
      fixtureKey: key,
      agentId: E2E_AGENT_LINK_LIFECYCLE_PAIR.agentId,
      memberId: E2E_AGENT_LINK_LIFECYCLE_PAIR.memberId,
      previousStatus: fixture.previousStatus,
      status: fixture.status,
    },
    createdAt: new Date(fixture.at),
  }));
}

export async function seedAgentLinkLifecycle({ db, schema }: SeedGoldenContext): Promise<void> {
  const row = buildAgentLinkLifecycleRow();
  await db
    .insert(schema.agentClients)
    .values(row)
    .onConflictDoUpdate({
      target: schema.agentClients.id,
      set: excludedSet(schema.agentClients, row),
    });
  const history = buildAgentLinkLifecycleHistoryToSeed();
  await db
    .insert(schema.auditLog)
    .values(history)
    .onConflictDoUpdate({
      target: schema.auditLog.id,
      set: excludedSet(schema.auditLog, history[0]),
    });
}
