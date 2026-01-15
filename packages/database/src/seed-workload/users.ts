import type { SeedConfig } from '../seed-types';
import { hashPassword } from '../seed-utils/hash-password';
import {
  ALBANIAN_NAMES,
  MACEDONIAN_NAMES,
  TENANTS,
  WORKLOAD_PASSWORD,
  WORKLOAD_PREFIX,
} from './constants';

export async function seedWorkloadUsers(db: any, schema: any, config: SeedConfig) {
  console.log('👥 Seeding Workload Users...');
  const { at } = config;
  const hashedPassword = hashPassword(WORKLOAD_PASSWORD);

  const usersToSeed: any[] = [];
  const accountsToSeed: any[] = [];

  // Helper to create user + account
  const addUser = (
    id: string,
    name: string,
    email: string,
    role: string,
    tenantId: string,
    branchId?: string
  ) => {
    usersToSeed.push({
      id,
      name,
      email,
      role,
      tenantId,
      branchId: branchId || null,
      emailVerified: true,
      createdAt: at(),
      updatedAt: at(),
    });
    accountsToSeed.push({
      id: `${id}-credential`,
      userId: id,
      accountId: email,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: at(),
      updatedAt: at(),
    });
  };

  // KS: 1 Manager, 2 agents, 2 staff, 30 members
  addUser(
    `${WORKLOAD_PREFIX}ks_mgr`,
    'Valmir Shala',
    'mgr.ks.work@example.com',
    'branch_manager',
    TENANTS.KS,
    `${WORKLOAD_PREFIX}ks_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_agent_1`,
    'Luan Berisha',
    'agent.ks.work1@example.com',
    'agent',
    TENANTS.KS,
    `${WORKLOAD_PREFIX}ks_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_agent_2`,
    'Arbenita Krasniqi',
    'agent.ks.work2@example.com',
    'agent',
    TENANTS.KS,
    `${WORKLOAD_PREFIX}ks_branch_2`
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_staff_1`,
    'Besnik Gashi',
    'staff.ks.work1@example.com',
    'staff',
    TENANTS.KS
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_staff_2`,
    'Drita Morina',
    'staff.ks.work2@example.com',
    'staff',
    TENANTS.KS
  );

  for (let i = 0; i < 30; i++) {
    const name = ALBANIAN_NAMES[i % ALBANIAN_NAMES.length] + ` ${i + 1}`;
    const branchId = `${WORKLOAD_PREFIX}ks_branch_${(i % 3) + 1}`;
    addUser(
      `${WORKLOAD_PREFIX}ks_member_${i + 1}`,
      name,
      `member.ks.work${i + 1}@example.com`,
      'member',
      TENANTS.KS,
      branchId
    );
  }

  // MK: 1 Manager, 2 agents, 1 staff, 20 members
  addUser(
    `${WORKLOAD_PREFIX}mk_mgr`,
    'Zoran Jovanovski',
    'mgr.mk.work@example.com',
    'branch_manager',
    TENANTS.MK,
    `${WORKLOAD_PREFIX}mk_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}mk_agent_1`,
    'Elena Petrovska',
    'agent.mk.work1@example.com',
    'agent',
    TENANTS.MK,
    `${WORKLOAD_PREFIX}mk_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}mk_agent_2`,
    'Igor Naumovski',
    'agent.mk.work2@example.com',
    'agent',
    TENANTS.MK,
    `${WORKLOAD_PREFIX}mk_branch_2`
  );
  addUser(
    `${WORKLOAD_PREFIX}mk_staff_1`,
    'Maja Stojanovska',
    'staff.mk.work1@example.com',
    'staff',
    TENANTS.MK
  );

  for (let i = 0; i < 20; i++) {
    const name = MACEDONIAN_NAMES[i % MACEDONIAN_NAMES.length] + ` ${i + 1}`;
    const branchId = `${WORKLOAD_PREFIX}mk_branch_${(i % 2) + 1}`;
    addUser(
      `${WORKLOAD_PREFIX}mk_member_${i + 1}`,
      name,
      `member.mk.work${i + 1}@example.com`,
      'member',
      TENANTS.MK,
      branchId
    );
  }

  // Batch insert users
  for (const chunk of chunkArray(usersToSeed, 20)) {
    await db.insert(schema.user).values(chunk).onConflictDoNothing();
  }

  // Batch insert accounts
  for (const chunk of chunkArray(accountsToSeed, 20)) {
    await db.insert(schema.account).values(chunk).onConflictDoNothing();
  }

  return {
    agents: usersToSeed.filter(u => u.role === 'agent'),
    staff: usersToSeed.filter(u => u.role === 'staff'),
    members: usersToSeed.filter(u => u.role === 'member'),
  };
}

function chunkArray(array: any[], size: number) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
