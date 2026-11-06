import { db, E2E_USERS, eq, memberLeads, user } from '@interdomestik/database';
import { expect } from '@playwright/test';

export type OwnedLead = { id: string; email: string };

/**
 * Inserts a `new` member lead owned by the seeded agent of `tenant`, in that agent's branch, so a
 * test reads or drives a lead whose state no other test depends on.
 *
 * `idPrefix` must stay outside the seed cleanup prefixes (`golden_`, `pack_ks_`, `member_`): a
 * converted lead keeps app-created rows (attempt, member) that the prefix cleanup does not own, and
 * the reseed removes these leads through their agent instead. Callers remove what they leave open.
 */
export async function insertOwnedMemberLead(
  tenant: 'ks' | 'mk',
  idPrefix: string,
  lastName: string
): Promise<OwnedLead> {
  const agentEmail = tenant === 'mk' ? E2E_USERS.MK_AGENT.email : E2E_USERS.KS_AGENT.email;
  const agent = await db.query.user.findFirst({ where: eq(user.email, agentEmail) });
  expect(agent?.branchId, `seeded ${tenant} agent with a branch`).toBeTruthy();
  const id = `${idPrefix}_${tenant}_${Date.now()}`;
  const email = `${id}@example.com`;
  await db.insert(memberLeads).values({
    id,
    tenantId: agent!.tenantId,
    branchId: agent!.branchId!,
    agentId: agent!.id,
    firstName: 'E2E',
    lastName,
    email,
    phone: '+38970888888',
    status: 'new',
  });
  return { id, email };
}
