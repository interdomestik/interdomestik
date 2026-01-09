import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../schema';
import { SEED_PASSWORD, TENANTS, USERS } from './constants';
import { hashPassword } from './helpers';

export async function seedUsersAndAuth() {
  console.log('👥 Seeding Users and Auth...');
  const hashedPassword = hashPassword(SEED_PASSWORD);

  // 1. Core Users
  for (const u of USERS) {
    await db
      .insert(schema.user)
      .values({
        ...u,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.user.id,
        set: {
          name: u.name,
          role: u.role,
          branchId: u.branchId ?? null,
          tenantId: u.tenantId,
        },
      });

    // Upsert Credentials
    await db
      .insert(schema.account)
      .values({
        id: `${u.id}-credential`,
        accountId: u.email,
        providerId: 'credential',
        userId: u.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      // If credential exists, update password to ensure we can login
      .onConflictDoUpdate({
        target: schema.account.id,
        set: {
          password: hashedPassword,
          updatedAt: new Date(),
        },
      });
  }

  // 2. Generate Members (Deterministic but with ID logic)
  const members = [];

  // MK Members
  for (let i = 1; i <= 9; i++) {
    const isGolden = i <= 2; // Member 1 and 2 are in Golden
    members.push({
      id: isGolden ? `golden_mk_member_${i}` : `full_mk_member_${i}`,
      email: `member.mk.${i}@interdomestik.com`,
      name: `MK Member ${i}`,
      tenantId: TENANTS.MK,
    });
  }
  // KS Members
  for (let i = 1; i <= 9; i++) {
    const isGolden = i === 1; // Member 1 is in Golden
    members.push({
      id: isGolden ? `golden_ks_member_${i}` : `full_ks_member_${i}`,
      email: `member.ks.${i}@interdomestik.com`,
      name: `KS Member ${i}`,
      tenantId: TENANTS.KS,
    });
  }

  for (const m of members) {
    await db
      .insert(schema.user)
      .values({
        ...m,
        role: 'user',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.user.id,
        set: { name: m.name, role: 'user', tenantId: m.tenantId },
      });

    await db
      .insert(schema.account)
      .values({
        id: `${m.id}-credential`,
        accountId: m.email,
        providerId: 'credential',
        userId: m.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.account.id, set: { password: hashedPassword } });
  }

  // 3. Agent Assignments (Link Members to Agents)
  console.log('🤝 Seeding Agent Assignments...');
  const assignments = [
    // MK
    {
      agentId: 'golden_mk_agent_a1',
      memberIds: ['golden_mk_member_1', 'golden_mk_member_2', 'full_mk_member_3'],
      tenantId: TENANTS.MK,
    },
    {
      agentId: 'golden_mk_agent_a2',
      memberIds: ['full_mk_member_4', 'full_mk_member_5'],
      tenantId: TENANTS.MK,
    },
    {
      agentId: 'full_mk_agent_b1',
      memberIds: ['full_mk_member_6', 'full_mk_member_7'],
      tenantId: TENANTS.MK,
    },
    // KS
    {
      agentId: 'golden_ks_agent_a1',
      memberIds: ['golden_ks_member_1', 'full_ks_member_2', 'full_ks_member_3'],
      tenantId: TENANTS.KS,
    },
    {
      agentId: 'full_ks_agent_b1',
      memberIds: ['full_ks_member_4', 'full_ks_member_5'],
      tenantId: TENANTS.KS,
    },
  ];

  for (const group of assignments) {
    for (const memberId of group.memberIds) {
      const id = `assign-${group.agentId}-${memberId}`;
      await db
        .insert(schema.agentClients)
        .values({
          id,
          tenantId: group.tenantId,
          agentId: group.agentId,
          memberId: memberId,
          status: 'active',
        })
        .onConflictDoNothing();

      // Link in user table too
      await db
        .update(schema.user)
        .set({ agentId: group.agentId })
        .where(eq(schema.user.id, memberId));
    }
  }
}
