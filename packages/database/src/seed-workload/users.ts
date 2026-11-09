import type { SeedConfig } from '../seed-types';
import { hashPassword } from '../seed-utils/hash-password';
import { WORKLOAD_PASSWORD } from './constants';
import { buildWorkloadUsers } from './user-fixtures';

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
      accountId: id,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: at(),
      updatedAt: at(),
    });
  };

  for (const fixture of buildWorkloadUsers()) {
    addUser(
      fixture.id,
      fixture.name,
      fixture.email,
      fixture.role,
      fixture.tenantId,
      fixture.branchId ?? undefined
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
