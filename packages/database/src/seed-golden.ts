import { randomBytes, scryptSync } from 'crypto';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

// Force load .env from project root
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const SCRYPT_PARAMS = {
  N: 16384,
  r: 16,
  p: 1,
  keyLength: 64,
  maxmem: 128 * 16384 * 16 * 2,
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return `${salt}:${key.toString('hex')}`;
}

const GOLDEN_PASSWORD = 'GoldenPass123!';

async function seedGolden() {
  console.log('🌱 Starting Golden Seed...');

  // Use dynamic import for DB connection and Schema
  const { db } = await import('./db');
  const schema = await import('./schema');
  const { eq, inArray } = await import('drizzle-orm');

  const TENANTS = {
    MK: 'tenant_mk',
    KS: 'tenant_ks',
  };

  const BRANCHES = [
    {
      id: 'mk_branch_a',
      name: 'MK Branch A (Main)',
      tenantId: TENANTS.MK,
      slug: 'mk-branch-a',
      code: 'MK-A',
    },
    {
      id: 'mk_branch_b',
      name: 'MK Branch B (East)',
      tenantId: TENANTS.MK,
      slug: 'mk-branch-b',
      code: 'MK-B',
    },
    {
      id: 'ks_branch_a',
      name: 'KS Branch A (Main)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-a',
      code: 'KS-A',
    },
    {
      id: 'ks_branch_b',
      name: 'KS Branch B (West)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-b',
      code: 'KS-B',
    },
    {
      id: 'mk_branch_empty',
      name: 'MK Branch Empty',
      tenantId: TENANTS.MK,
      slug: 'mk-branch-empty',
      code: 'MK-E',
    },
  ];

  const USERS = [
    // Super Admin
    {
      id: 'golden_super_admin',
      name: 'Super Admin',
      email: 'super@interdomestik.com',
      role: 'super_admin',
      tenantId: TENANTS.MK,
    },

    // MK Users
    {
      id: 'golden_mk_admin',
      name: 'MK Admin',
      email: 'admin.mk@interdomestik.com',
      role: 'tenant_admin',
      tenantId: TENANTS.MK,
    },
    {
      id: 'golden_mk_staff',
      name: 'MK Staff',
      email: 'staff.mk@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.MK,
    },
    {
      id: 'golden_mk_bm_a',
      name: 'MK Manager A',
      email: 'bm.mk.a@interdomestik.com',
      role: 'branch_manager',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    {
      id: 'golden_mk_bm_b',
      name: 'MK Manager B',
      email: 'bm.mk.b@interdomestik.com',
      role: 'branch_manager',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_b',
    },
    {
      id: 'golden_mk_agent_a1',
      name: 'MK Agent A1',
      email: 'agent.mk.a1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.MK,
    },
    {
      id: 'golden_mk_agent_a2',
      name: 'MK Agent A2',
      email: 'agent.mk.a2@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.MK,
    },
    {
      id: 'golden_mk_member_1',
      name: 'MK Member 1',
      email: 'member.mk.1@interdomestik.com',
      role: 'user',
      tenantId: TENANTS.MK,
    },
    {
      id: 'golden_mk_member_2',
      name: 'MK Member 2',
      email: 'member.mk.2@interdomestik.com',
      role: 'user',
      tenantId: TENANTS.MK,
    },

    // KS Users
    {
      id: 'golden_ks_admin',
      name: 'KS Admin',
      email: 'admin.ks@interdomestik.com',
      role: 'tenant_admin',
      tenantId: TENANTS.KS,
    },
    {
      id: 'golden_ks_staff',
      name: 'KS Staff',
      email: 'staff.ks@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.KS,
    },
    {
      id: 'golden_ks_agent_a1',
      name: 'KS Agent A1',
      email: 'agent.ks.a1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.KS,
    },
    {
      id: 'golden_ks_member_1',
      name: 'KS Member 1',
      email: 'member.ks.1@interdomestik.com',
      role: 'user',
      tenantId: TENANTS.KS,
    },
  ];

  // 1. Clean up existing Golden Data (Idempotency)
  console.log('🧹 Cleaning up old Golden data...');
  const userIds = USERS.map(u => u.id);

  // Clean dependent tables first
  const existingClaims = await db.query.claims.findMany({
    where: inArray(schema.claims.userId, userIds),
  });
  if (existingClaims.length > 0) {
    const cIds = existingClaims.map(c => c.id);
    await db.delete(schema.claimMessages).where(inArray(schema.claimMessages.claimId, cIds));
    await db.delete(schema.claimDocuments).where(inArray(schema.claimDocuments.claimId, cIds));
    await db
      .delete(schema.claimStageHistory)
      .where(inArray(schema.claimStageHistory.claimId, cIds));
    await db.delete(schema.claims).where(inArray(schema.claims.id, cIds));
  }

  // Delete accounts first (foreign key constraint)
  await db.delete(schema.account).where(inArray(schema.account.userId, userIds));
  // Delete sessions explicitly
  await db.delete(schema.session).where(inArray(schema.session.userId, userIds));

  await db.delete(schema.agentClients).where(inArray(schema.agentClients.memberId, userIds));
  await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.userId, userIds));

  // Now safe to delete users
  await db.delete(schema.user).where(inArray(schema.user.id, userIds));
  // Branches cleanup if needed, but we upsert them

  // 2. Upsert Tenants (Ensuring they exist)
  console.log('🏢 Seeding Tenants...');
  await db
    .insert(schema.tenants)
    .values([
      {
        id: TENANTS.MK,
        name: 'North Macedonia',
        contact: { email: 'support.mk@interdomestik.com' },
        legalName: 'Interdomestik MK DOOEL',
        countryCode: 'MK',
      },
      {
        id: TENANTS.KS,
        name: 'Kosovo',
        contact: { email: 'support.ks@interdomestik.com' },
        legalName: 'Interdomestik KS LLC',
        countryCode: 'XK',
      },
    ])
    .onConflictDoUpdate({ target: schema.tenants.id, set: { name: schema.tenants.name } });

  // 3. Upsert Branches
  console.log('🌿 Seeding Branches...');
  await db
    .insert(schema.branches)
    .values(BRANCHES)
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: { name: schema.branches.name, code: schema.branches.code },
    });

  // Hashing logic from scripts/seed-e2e-users.mjs

  const SCRYPT_PARAMS = {
    N: 16384,
    r: 16,
    p: 1,
    keyLength: 64,
    maxmem: 128 * 16384 * 16 * 2,
  };

  function hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const key = scryptSync(password.normalize('NFKC'), salt, SCRYPT_PARAMS.keyLength, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: SCRYPT_PARAMS.maxmem,
    });
    return `${salt}:${key.toString('hex')}`;
  }

  const GOLDEN_PASSWORD = 'GoldenPass123!';

  // 4. Upsert Users & Accounts
  console.log('👥 Seeding Users & Credentials...');
  const hashedPassword = hashPassword(GOLDEN_PASSWORD);

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

    // Upsert Account (Password)
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
      .onConflictDoUpdate({
        target: schema.account.id,
        set: {
          password: hashedPassword,
          accountId: u.email,
          updatedAt: new Date(),
        },
      });
  }

  // 5. Agent Assignments
  console.log('🤝 Linking Agents to Members...');
  const assignments = [
    { agentId: 'golden_mk_agent_a1', memberId: 'golden_mk_member_1', tenantId: TENANTS.MK },
    { agentId: 'golden_mk_agent_a2', memberId: 'golden_mk_member_2', tenantId: TENANTS.MK },
    { agentId: 'golden_ks_agent_a1', memberId: 'golden_ks_member_1', tenantId: TENANTS.KS },
  ];

  for (const a of assignments) {
    const id = `assign-${a.agentId}-${a.memberId}`;
    await db
      .insert(schema.agentClients)
      .values({
        id,
        tenantId: a.tenantId,
        agentId: a.agentId,
        memberId: a.memberId,
        status: 'active',
      })
      .onConflictDoUpdate({ target: schema.agentClients.id, set: { status: 'active' } });

    // Also update user record for redundancy/perf if schema uses it
    await db.update(schema.user).set({ agentId: a.agentId }).where(eq(schema.user.id, a.memberId));
  }

  // 6. Subscriptions
  console.log('💳 Seeding Subscriptions...');
  // Ensure a plan exists
  const PLAN_MK = 'golden_mk_plan_basic';
  await db
    .insert(schema.membershipPlans)
    .values({
      id: PLAN_MK,
      tenantId: TENANTS.MK,
      name: 'Golden Basic MK',
      tier: 'standard',
      price: '100.00',
      features: ['towing', 'legal'],
    })
    .onConflictDoNothing();

  const subs = [
    {
      id: 'sub_mk_1',
      userId: 'golden_mk_member_1',
      tenantId: TENANTS.MK,
      status: 'active',
      planId: PLAN_MK,
      agentId: 'golden_mk_agent_a1',
    },
    {
      id: 'sub_mk_2',
      userId: 'golden_mk_member_2',
      tenantId: TENANTS.MK,
      status: 'canceled',
      planId: PLAN_MK,
      agentId: 'golden_mk_agent_a2',
    },
  ];

  for (const s of subs) {
    await db
      .insert(schema.subscriptions)
      .values({
        id: s.id,
        userId: s.userId,
        tenantId: s.tenantId,
        status: s.status as any,
        planId: s.planId,
        agentId: s.agentId,
        currentPeriodStart: new Date(), // Corrected from startDate
      })
      .onConflictDoUpdate({ target: schema.subscriptions.id, set: { status: s.status as any } });
  }

  // 7. Claims
  console.log('📝 Seeding Claims...');
  const claimsData = [
    {
      id: 'claim_mk_1',
      userId: 'golden_mk_member_1',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      status: 'submitted',
      title: 'Rear ended in Skopje',
      amount: '500.00',
    },
    {
      id: 'claim_mk_2',
      userId: 'golden_mk_member_1',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      status: 'draft',
      title: 'Broken Mirror',
      amount: '150.00',
    },
    {
      id: 'claim_mk_3',
      userId: 'golden_mk_member_2',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_b',
      status: 'evaluation',
      title: 'Towing Service',
      amount: '200.00',
    }, // Branch B
    {
      id: 'claim_ks_1',
      userId: 'golden_ks_member_1',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      status: 'submitted',
      title: 'Pristina Fender Bender',
      amount: '300.00',
    },
  ];

  for (const c of claimsData) {
    await db
      .insert(schema.claims)
      .values({
        id: c.id,
        userId: c.userId,
        tenantId: c.tenantId,
        branchId: c.branchId,
        status: c.status as any,
        title: c.title,
        claimAmount: c.amount,
        currency: 'EUR',
        category: 'vehicle',
        companyName: 'Test Insurer',
        description: 'Seeded via Golden Seed',
      })
      .onConflictDoUpdate({ target: schema.claims.id, set: { status: c.status as any } });
  }

  console.log('✅ Golden Seed Complete!');
  process.exit(0);
}

// Execute
seedGolden().catch(e => {
  console.error('❌ Golden Seed Failed:', e);
  process.exit(1);
});
