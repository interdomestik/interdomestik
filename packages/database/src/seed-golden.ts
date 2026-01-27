/**
 * Contract:
 * - seed:golden is immutable and baseline-only
 * - seed:workload is additive and self-cleaning
 * - seeds must never reference each other's IDs
 */
import { E2E_PASSWORD, E2E_USERS } from './e2e-users';
import type { SeedConfig } from './seed-types';
import { cleanupByPrefixes } from './seed-utils/cleanup';
import { hashPassword } from './seed-utils/hash-password';
import { goldenId } from './seed-utils/seed-ids';

// Export for composition
export async function seedGolden(config: SeedConfig) {
  console.log('🌱 Starting Golden Seed (Baseline)...');

  const { db } = await import('./db');
  const schema = await import('./schema');
  const { eq, inArray, sql } = await import('drizzle-orm');
  const { at } = config;

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
      name: 'KS Branch A (Prishtina)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-a',
      code: 'KS-A',
    },
    {
      id: 'ks_branch_b',
      name: 'KS Branch B (Prizren)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-b',
      code: 'KS-B',
    },
    {
      id: 'ks_branch_c',
      name: 'KS Branch C (Peja)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-c',
      code: 'KS-C',
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
      id: goldenId('super_admin'),
      name: E2E_USERS.SUPER_ADMIN.name,
      email: E2E_USERS.SUPER_ADMIN.email,
      role: E2E_USERS.SUPER_ADMIN.dbRole,
      tenantId: TENANTS.MK,
    },
    // MK Users
    {
      id: goldenId('mk_admin'),
      name: E2E_USERS.MK_ADMIN.name,
      email: E2E_USERS.MK_ADMIN.email,
      role: E2E_USERS.MK_ADMIN.dbRole,
      tenantId: TENANTS.MK,
    },
    {
      id: goldenId('mk_staff'),
      name: E2E_USERS.MK_STAFF.name,
      email: E2E_USERS.MK_STAFF.email,
      role: E2E_USERS.MK_STAFF.dbRole,
      tenantId: TENANTS.MK,
    },
    {
      id: goldenId('mk_bm_a'),
      name: E2E_USERS.MK_BRANCH_MANAGER.name,
      email: E2E_USERS.MK_BRANCH_MANAGER.email,
      role: E2E_USERS.MK_BRANCH_MANAGER.dbRole,
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    {
      id: goldenId('mk_agent_a1'),
      name: E2E_USERS.MK_AGENT.name,
      email: E2E_USERS.MK_AGENT.email,
      role: E2E_USERS.MK_AGENT.dbRole,
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    {
      id: goldenId('mk_agent_pro_1'),
      name: E2E_USERS.MK_AGENT_PRO.name,
      email: E2E_USERS.MK_AGENT_PRO.email,
      role: E2E_USERS.MK_AGENT_PRO.dbRole,
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    {
      id: goldenId('mk_member_1'),
      name: E2E_USERS.MK_MEMBER.name,
      email: E2E_USERS.MK_MEMBER.email,
      role: 'member',
      tenantId: TENANTS.MK,
      memberNumber: 'MEM-2026-000001',
      memberNumberIssuedAt: at(),
    },
    {
      id: goldenId('mk_member_2'),
      name: 'MK Member 2',
      email: 'member.mk.2@interdomestik.com',
      role: 'member',
      tenantId: TENANTS.MK,
      memberNumber: 'MEM-2026-000015',
      memberNumberIssuedAt: at(),
    },
    // KS Users & Staff
    {
      id: goldenId('ks_admin'),
      name: E2E_USERS.KS_ADMIN.name,
      email: E2E_USERS.KS_ADMIN.email,
      role: E2E_USERS.KS_ADMIN.dbRole,
      tenantId: TENANTS.KS,
    },
    {
      id: goldenId('ks_staff'),
      name: E2E_USERS.KS_STAFF.name,
      email: E2E_USERS.KS_STAFF.email,
      role: E2E_USERS.KS_STAFF.dbRole,
      tenantId: TENANTS.KS,
    },
    {
      id: goldenId('ks_staff_2'),
      name: 'Besian Mustafa',
      email: 'staff.ks.2@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.KS,
    },
    {
      id: goldenId('ks_bm_a'),
      name: E2E_USERS.KS_BRANCH_MANAGER.name,
      email: E2E_USERS.KS_BRANCH_MANAGER.email,
      role: E2E_USERS.KS_BRANCH_MANAGER.dbRole,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
    },
    {
      id: goldenId('ks_agent_a1'),
      name: E2E_USERS.KS_AGENT.name,
      email: E2E_USERS.KS_AGENT.email,
      role: E2E_USERS.KS_AGENT.dbRole,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
    },
    {
      id: goldenId('ks_agent_lite_1'),
      name: E2E_USERS.KS_AGENT_LITE.name,
      email: E2E_USERS.KS_AGENT_LITE.email,
      role: E2E_USERS.KS_AGENT_LITE.dbRole,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
    },
    {
      id: goldenId('ks_b_agent_1'),
      name: 'Valmir Shala',
      email: 'agent.ks.b1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_b',
    },
    {
      id: goldenId('ks_c_agent_1'),
      name: 'Luan Berisha',
      email: 'agent.ks.c1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_c',
    },
    // KS Members
    ...Array.from({ length: 6 }).map((_, i) => ({
      id: goldenId(`ks_a_member_${i + 1}`),
      name: `KS A-Member ${i + 1}`,
      email: `member.ks.a${i + 1}@interdomestik.com`,
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      memberNumber: `MEM-2026-00000${i + 2}`,
      memberNumberIssuedAt: at(),
    })),
    ...Array.from({ length: 4 }).map((_, i) => ({
      id: goldenId(`ks_b_member_${i + 1}`),
      name: `KS B-Member ${i + 1}`,
      email: `member.ks.b${i + 1}@interdomestik.com`,
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_b',
      memberNumber: `MEM-2026-0000${8 + i}`,
      memberNumberIssuedAt: at(),
    })),
    ...Array.from({ length: 2 }).map((_, i) => ({
      id: goldenId(`ks_c_member_${i + 1}`),
      name: `KS C-Member ${i + 1}`,
      email: `member.ks.c${i + 1}@interdomestik.com`,
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_c',
      memberNumber: `MEM-2026-0000${12 + i}`,
      memberNumberIssuedAt: at(),
    })),
    // Balkan Agent
    {
      id: goldenId('agent_balkan_1'),
      name: 'Balkan Agent 1',
      email: 'agent.balkan.1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    // Tracking Demo Member
    {
      id: goldenId('ks_member_tracking'),
      name: 'KS Tracking Demo',
      email: 'member.tracking.ks@interdomestik.com',
      role: 'member',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      memberNumber: 'MEM-2026-000014',
      memberNumberIssuedAt: at(),
    },
  ];

  // 1. Cleanup
  await cleanupByPrefixes(db, schema, ['golden_', 'pack_ks_', 'member_followups', 'member_']);

  // Pre-emptive cleanup for specific claim numbers that might conflict if they exist with non-prefixed IDs
  await db
    .delete(schema.claims)
    .where(inArray(schema.claims.claimNumber, ['CLM-MK-2026-000001', 'CLM-XK-2026-800001']));

  // 2. Upsert Tenants
  console.log('🏢 Seeding Tenants...');
  await db
    .insert(schema.tenants)
    .values([
      {
        id: TENANTS.MK,
        name: 'North Macedonia',
        contact: { email: 'support.mk@interdomestik.com' },
        legalName: 'Interdomestik MK DOOEL',
        code: 'MK',
        countryCode: 'MK',
      },
      {
        id: TENANTS.KS,
        name: 'Kosovo',
        contact: { email: 'support.ks@interdomestik.com' },
        legalName: 'Interdomestik KS LLC',
        code: 'KS',
        countryCode: 'XK',
      },
    ])
    .onConflictDoUpdate({
      target: schema.tenants.id,
      set: { name: schema.tenants.name, code: sql`excluded.code` },
    });

  // 3. Upsert Branches
  console.log('🌿 Seeding Branches...');
  await db
    .insert(schema.branches)
    .values(BRANCHES)
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: { name: schema.branches.name, code: schema.branches.code },
    });

  // 4. Upsert Users & Accounts
  console.log('👥 Seeding Users & Credentials...');
  const hashedPassword = hashPassword(E2E_PASSWORD);

  for (const u of USERS) {
    await db
      .insert(schema.user)
      .values({
        ...u,
        emailVerified: true,
        createdAt: at(),
        updatedAt: at(),
      })
      .onConflictDoUpdate({
        target: schema.user.id,
        set: {
          name: u.name,
          role: u.role,
          branchId: 'branchId' in u ? (u.branchId as string) : null,
          agentId: 'agentId' in u ? (u.agentId as string) : null,
          tenantId: u.tenantId,
          memberNumber: 'memberNumber' in u ? (u.memberNumber as string) : null,
          memberNumberIssuedAt:
            'memberNumberIssuedAt' in u ? (u.memberNumberIssuedAt as Date) : null,
        },
      });

    await db
      .insert(schema.account)
      .values({
        id: `${u.id}-credential`,
        accountId: u.email,
        providerId: 'credential',
        userId: u.id,
        password: hashedPassword,
        createdAt: at(),
        updatedAt: at(),
      })
      .onConflictDoUpdate({
        target: schema.account.id,
        set: {
          password: hashedPassword,
          accountId: u.email,
          updatedAt: at(),
        },
      });
  }

  // 5. Agent Assignments
  console.log('🤝 Linking Agents to Members...');
  const assignmentData = [
    {
      id: goldenId('assign_mk_1'),
      agent: 'mk_agent_a1',
      member: 'mk_member_1',
      tenant: TENANTS.MK,
    },
    {
      id: goldenId('assign_mk_2'),
      agent: 'mk_agent_pro_1',
      member: 'mk_member_2',
      tenant: TENANTS.MK,
    },
    ...Array.from({ length: 2 }).map((_, i) => ({
      id: goldenId(`assign_ks_a_${i + 1}`),
      agent: 'ks_agent_a1',
      member: `ks_a_member_${i + 1}`,
      tenant: TENANTS.KS,
    })),
    {
      id: goldenId('assign_ks_a_lite_1'),
      agent: 'ks_agent_lite_1',
      member: 'ks_a_member_3',
      tenant: TENANTS.KS,
    },
  ];

  for (const a of assignmentData) {
    await db
      .insert(schema.agentClients)
      .values({
        id: a.id,
        tenantId: a.tenant,
        agentId: goldenId(a.agent),
        memberId: goldenId(a.member),
        status: 'active',
      })
      .onConflictDoUpdate({ target: schema.agentClients.id, set: { status: 'active' } });

    // SYNC: Ensure user.agentId is set for canonical lists
    await db
      .update(schema.user)
      .set({ agentId: goldenId(a.agent) })
      .where(eq(schema.user.id, goldenId(a.member)));
  }

  // 5b. Agent Settings (Pro/Lite gating)
  await db
    .insert(schema.agentSettings)
    .values([
      {
        id: goldenId('agent_settings_mk_a1'),
        tenantId: TENANTS.MK,
        agentId: goldenId('mk_agent_a1'),
        tier: 'standard',
        commissionRates: {},
      },
      {
        id: goldenId('agent_settings_mk_p1'),
        tenantId: TENANTS.MK,
        agentId: goldenId('mk_agent_pro_1'),
        tier: 'premium',
        commissionRates: {},
      },
      {
        id: goldenId('agent_settings_ks_a1'),
        tenantId: TENANTS.KS,
        agentId: goldenId('ks_agent_a1'),
        tier: 'premium',
        commissionRates: {},
      },
      {
        id: goldenId('agent_settings_ks_l1'),
        tenantId: TENANTS.KS,
        agentId: goldenId('ks_agent_lite_1'),
        tier: 'standard',
        commissionRates: {},
      },
    ])
    .onConflictDoUpdate({
      target: schema.agentSettings.agentId,
      set: { tier: sql`excluded.tier` },
    });

  // 6. Subscriptions & Plans
  console.log('💳 Seeding Subscriptions...');
  const PLAN_MK = 'golden_mk_plan_basic';
  const PLAN_KS = 'golden_ks_plan_basic';

  await db
    .insert(schema.membershipPlans)
    .values([
      {
        id: PLAN_MK,
        tenantId: TENANTS.MK,
        name: 'Golden Basic MK',
        tier: 'standard',
        price: '100.00',
        features: ['towing', 'legal'],
      },
      {
        id: PLAN_KS,
        tenantId: TENANTS.KS,
        name: 'Golden Basic KS',
        tier: 'standard',
        price: '120.00',
        features: ['towing', 'legal', 'roadside'],
      },
    ])
    .onConflictDoNothing();

  const subData = [
    {
      id: goldenId('sub_mk_1'),
      user: 'mk_member_1',
      tenant: TENANTS.MK,
      plan: PLAN_MK,
      agent: 'mk_agent_a1',
    },
    {
      id: goldenId('sub_mk_2'),
      user: 'mk_member_2',
      tenant: TENANTS.MK,
      plan: PLAN_MK,
      agent: 'mk_agent_pro_1',
    },
    // Target KS Members for "Members total" > 0
    {
      id: goldenId('sub_ks_a_1'),
      user: 'ks_a_member_1',
      tenant: TENANTS.KS,
      plan: PLAN_KS,
      agent: 'ks_agent_a1',
    },
    {
      id: goldenId('sub_ks_a_2'),
      user: 'ks_a_member_2',
      tenant: TENANTS.KS,
      plan: PLAN_KS,
      agent: 'ks_agent_a1',
    },
    {
      id: goldenId('sub_ks_a_3'),
      user: 'ks_a_member_3',
      tenant: TENANTS.KS,
      plan: PLAN_KS,
      agent: 'ks_agent_lite_1',
    },
    {
      id: goldenId('sub_ks_b_1'),
      user: 'ks_b_member_1',
      tenant: TENANTS.KS,
      plan: PLAN_KS,
      agent: 'ks_b_agent_1',
    },
  ];

  for (const s of subData) {
    await db
      .insert(schema.subscriptions)
      .values({
        id: s.id,
        userId: goldenId(s.user),
        tenantId: s.tenant,
        status: 'active',
        planId: s.plan,
        agentId: goldenId(s.agent),
        currentPeriodStart: at(),
      })
      .onConflictDoUpdate({ target: schema.subscriptions.id, set: { status: 'active' } });

    await db
      .insert(schema.membershipCards)
      .values({
        id: `card_${s.id}`,
        tenantId: s.tenant,
        subscriptionId: s.id,
        userId: goldenId(s.user),
        cardNumber: `ID-${s.tenant === TENANTS.KS ? 'KS' : 'MK'}-${Math.random().toString().slice(2, 10)}`,
        qrCodeToken: `qr_${s.id}_${Math.random().toString(36).slice(2, 7)}`,
        status: 'active',
      })
      .onConflictDoNothing();
  }

  // 7. Claims Pack (KS-A Urgent, KS-B Attention, KS-C Healthy)
  console.log('📝 Seeding Claims Pack (Ops Verification)...');
  const now = at();
  const claimsToSeed: (typeof schema.claims.$inferInsert)[] = [];

  // KS-A (Urgent): 21 claims
  const ksAStatuses = [
    'submitted',
    'submitted',
    'submitted',
    'submitted',
    'submitted',
    'submitted',
    'submitted',
    'submitted',
    'submitted',
    'verification',
    'verification',
    'verification',
    'verification',
    'evaluation',
    'evaluation',
    'evaluation',
    'evaluation',
    'negotiation',
    'negotiation',
    'negotiation',
    'court',
  ] as any[];

  ksAStatuses.forEach((status, i) => {
    const dayOffset = i < 9 ? i % 3 : i % 21;
    let createdAt = at(-dayOffset * 24 * 60 * 60 * 1000);

    // SLA Breaches in KS-A
    if (i === 0) createdAt = at(-35 * 24 * 60 * 60 * 1000);
    if (i === 1) createdAt = at(-45 * 24 * 60 * 60 * 1000);

    const claimId = `ks_a_claim_${(i + 1).toString().padStart(2, '0')}`;
    const staffId = i < 7 ? goldenId('ks_staff') : i < 12 ? goldenId('ks_staff_2') : null;

    claimsToSeed.push({
      id: goldenId(claimId),
      userId: goldenId(`ks_a_member_${(i % 4) + 1}`),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: goldenId('ks_agent_a1'),
      status: status,
      title: `KS-A ${status.toUpperCase()} Claim ${i + 1}`,
      category: 'vehicle',
      companyName: 'KS Insurance Co',
      claimAmount: '1200.00',
      createdAt,
      staffId,
      assignedAt: staffId ? now : null,
      assignedById: staffId ? goldenId('ks_admin') : null,
    });
  });

  Array.from({ length: 9 }).forEach((_, i) => {
    const status = (i < 5 ? 'submitted' : i < 7 ? 'verification' : 'evaluation') as any;
    const staffId = i < 4 ? goldenId('ks_staff') : null;
    claimsToSeed.push({
      id: goldenId(`ks_b_claim_${(i + 1).toString().padStart(2, '0')}`),
      userId: goldenId(`ks_b_member_${(i % 4) + 1}`),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_b',
      agentId: goldenId('ks_b_agent_1'),
      status,
      title: `KS-B Claim ${i + 1}`,
      category: 'vehicle',
      companyName: 'KS West Insurer',
      claimAmount: '800.00',
      createdAt: at(-(i + 1) * 24 * 60 * 60 * 1000),
      staffId,
      assignedAt: staffId ? now : null,
      assignedById: staffId ? goldenId('ks_admin') : null,
    });
  });

  // KS-C (Healthy): 2 claims
  [1, 2].forEach(i => {
    claimsToSeed.push({
      id: goldenId(`ks_c_claim_${i.toString().padStart(2, '0')}`),
      userId: goldenId(`ks_c_member_${i}`),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_c',
      agentId: goldenId('ks_c_agent_1'),
      status: i === 1 ? 'submitted' : 'verification',
      title: `KS-C Healthy Claim ${i}`,
      category: 'vehicle',
      companyName: 'Peja local',
      claimAmount: '450.00',
      createdAt: at(-i * 12 * 60 * 60 * 1000), // very recent
    });
  });

  // MK Baseline
  claimsToSeed.push({
    id: goldenId('claim_mk_1'),
    userId: goldenId('mk_member_1'),
    tenantId: TENANTS.MK,
    branchId: 'mk_branch_a',
    status: 'submitted',
    title: 'Rear ended in Skopje (Baseline)',
    category: 'vehicle',
    companyName: 'Test Insurer',
    claimAmount: '500.00',
    claimNumber: 'CLM-MK-2026-000001',
  });

  // CLAIM TRACKING PACK (Strict Deterministic)
  console.log('📝 Seeding CLAIM TRACKING PACK...');

  // 1) KS Tracking Claim (Open + Assigned)
  claimsToSeed.push({
    id: goldenId('ks_track_claim_001'),
    userId: goldenId('ks_member_tracking'),
    tenantId: TENANTS.KS,
    branchId: 'ks_branch_a',
    agentId: goldenId('ks_agent_a1'),
    status: 'evaluation',
    title: 'Aksident i lehtë – Demo Tracking',
    category: 'vehicle',
    companyName: 'KS Insurance Co',
    claimAmount: '250.00',
    currency: 'EUR',
    createdAt: at(-7 * 24 * 60 * 60 * 1000),
    updatedAt: at(-1 * 24 * 60 * 60 * 1000),
    staffId: goldenId('ks_staff'),
    assignedAt: at(-6 * 24 * 60 * 60 * 1000),
    assignedById: goldenId('ks_admin'),
    claimNumber: 'CLM-XK-2026-800001',
  });

  // 2) SLA Breach (Open + Old)
  claimsToSeed.push({
    id: goldenId('ks_track_claim_002'),
    userId: goldenId('ks_member_tracking'),
    tenantId: TENANTS.KS,
    branchId: 'ks_branch_a',
    agentId: goldenId('ks_agent_a1'),
    status: 'submitted',
    title: 'Vonesë në shqyrtim – SLA Demo',
    category: 'property',
    companyName: 'KS Insurance Co',
    claimAmount: '120.00',
    createdAt: at(-40 * 24 * 60 * 60 * 1000), // >30 days
    updatedAt: at(-10 * 24 * 60 * 60 * 1000),
    staffId: null,
  });

  // 3) Closed Example
  claimsToSeed.push({
    id: goldenId('ks_track_claim_003'),
    userId: goldenId('ks_member_tracking'),
    tenantId: TENANTS.KS,
    branchId: 'ks_branch_a',
    agentId: goldenId('ks_agent_a1'),
    status: 'resolved',
    title: 'E përfunduar – Demo',
    category: 'other',
    companyName: 'KS Insurance Co',
    claimAmount: '90.00',
    createdAt: at(-20 * 24 * 60 * 60 * 1000),
    updatedAt: at(-15 * 24 * 60 * 60 * 1000),
  });

  // 4) MK Tracking Claim (Critical for E2E Determinism)
  claimsToSeed.push({
    id: goldenId('mk_track_claim_001'),
    userId: goldenId('mk_member_1'),
    tenantId: TENANTS.MK,
    branchId: 'mk_branch_a',
    agentId: goldenId('mk_agent_a1'),
    status: 'submitted',
    title: 'MK Deterministic Claim',
    category: 'vehicle',
    companyName: 'MK Auto Osiguruvanje',
    claimAmount: '300.00',
    currency: 'EUR',
    createdAt: at(-2 * 24 * 60 * 60 * 1000),
    claimNumber: 'CLM-MK-2026-900001', // Special range
  });

  for (const c of claimsToSeed) {
    await db
      .insert(schema.claims)
      .values(c)
      .onConflictDoUpdate({
        target: schema.claims.id,
        set: {
          status: c.status,
          staffId: c.staffId,
          branchId: c.branchId,
          createdAt: c.createdAt,
          claimNumber: c.claimNumber,
        },
      });
  }

  // 8. Leads & Cash Pending
  console.log('💰 Seeding Leads & Cash Pending (KS)...');
  const ksLeads = [
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: `ks_a_cash_lead_${i + 1}`,
      branch: 'ks_branch_a',
      agent: 'ks_agent_a1',
    })),
    { id: 'ks_b_cash_lead_1', branch: 'ks_branch_b', agent: 'ks_b_agent_1' },
  ];

  for (const l of ksLeads) {
    await db
      .insert(schema.memberLeads)
      .values({
        id: goldenId(l.id),
        tenantId: TENANTS.KS,
        branchId: l.branch,
        agentId: goldenId(l.agent),
        firstName: 'Demo',
        lastName: `Lead ${l.id}`,
        email: `${l.id}@example.com`,
        phone: '+38344111222',
        status: 'payment_pending',
      })
      .onConflictDoNothing();

    await db
      .insert(schema.leadPaymentAttempts)
      .values({
        id: goldenId(`attempt_${l.id}`),
        tenantId: TENANTS.KS,
        leadId: goldenId(l.id),
        method: 'cash',
        status: 'pending',
        amount: 15000,
        createdAt: at(-(ksLeads.indexOf(l) + 1) * 2 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing();
  }

  // MK Balkan Lead
  await db
    .insert(schema.memberLeads)
    .values({
      id: goldenId('lead_balkan'),
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      agentId: goldenId('agent_balkan_1'),
      firstName: 'Balkan',
      lastName: 'Lead',
      email: 'lead.balkan@example.com',
      phone: '+38970111222',
      status: 'payment_pending',
    })
    .onConflictDoNothing();

  await db
    .insert(schema.leadPaymentAttempts)
    .values({
      id: goldenId('pay_attempt_balkan'),
      tenantId: TENANTS.MK,
      leadId: goldenId('lead_balkan'),
      method: 'cash',
      status: 'pending',
      amount: 12000,
      createdAt: at(),
    })
    .onConflictDoNothing();

  // 9. Tracking Tokens
  console.log('🔗 Seeding Tracking Tokens...');

  // Use Node crypto for SHA256
  const crypto = await import('crypto');

  // Deterministic Token for ks_track_claim_001
  const rawToken = 'demo-ks-track-token-001';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  await db
    .insert(schema.claimTrackingTokens)
    .values({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // Deterministic UUID
      tenantId: TENANTS.KS,
      claimId: goldenId('ks_track_claim_001'),
      tokenHash: tokenHash,
      // Expires in 30 days
      expiresAt: at(30 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing();

  // 10. Member Counters
  console.log('🔢 Initializing Member Counters...');
  await db
    .insert(schema.memberCounters)
    .values({
      year: 2026,
      lastNumber: 100, // Reserve first 100 for Golden/Static members
      updatedAt: at(),
    })
    .onConflictDoUpdate({
      target: schema.memberCounters.year,
      set: { lastNumber: sql`GREATEST(${schema.memberCounters.lastNumber}, 100)` },
    });

  // 11. Follow-up Leads
  console.log('📅 Seeding Agent Follow-up Leads...');
  const followUpLeads = [
    {
      id: 'ks_followup_lead_1',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: 'ks_agent_a1',
      firstName: 'FollowUp',
      lastName: 'Due Today KS',
      email: 'followup.ks.1@example.com',
      note: 'Call to finalize deal',
      nextStepAt: at(), // Today (due)
    },
    {
      id: 'ks_followup_lead_2',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: 'ks_agent_a1',
      firstName: 'FollowUp',
      lastName: 'Overdue KS',
      email: 'followup.ks.2@example.com',
      note: 'Urgent check-in',
      nextStepAt: at(-3 * 24 * 60 * 60 * 1000), // 3 days ago
    },
    {
      id: 'mk_followup_lead_1',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      agentId: 'mk_agent_a1',
      firstName: 'FollowUp',
      lastName: 'Due MK',
      email: 'followup.mk@example.com',
      note: 'Collect documents',
      nextStepAt: at(-1 * 24 * 60 * 60 * 1000), // Yesterday
    },
  ];

  for (const l of followUpLeads) {
    await db
      .insert(schema.memberLeads)
      .values({
        id: goldenId(l.id),
        tenantId: l.tenantId,
        branchId: l.branchId,
        agentId: goldenId(l.agentId),
        firstName: l.firstName,
        lastName: l.lastName,
        email: l.email,
        phone: '+000000000',
        status: 'contacted',
        nextStepAt: l.nextStepAt,
        nextStepNote: l.note,
      })
      .onConflictDoNothing();
  }

  // 12. Real Member Follow-ups
  console.log('📅 Seeding Real Member Follow-ups...');
  const realMemberFollowups = [
    {
      id: goldenId('ks_member_followup_1'),
      tenantId: TENANTS.KS,
      agentId: goldenId('ks_agent_a1'),
      memberId: goldenId('ks_a_member_1'),
      note: 'Kontrollo nëse anëtari e ka marrë policën e sigurimit',
      dueAt: at(), // Today
    },
    {
      id: goldenId('ks_member_followup_2'),
      tenantId: TENANTS.KS,
      agentId: goldenId('ks_agent_a1'),
      memberId: goldenId('ks_a_member_2'),
      note: 'Përditësim mbi vlerësimin e dëmit në proces',
      dueAt: at(-2 * 24 * 60 * 60 * 1000), // 2 days ago
    },
    {
      id: goldenId('mk_member_followup_1'),
      tenantId: TENANTS.MK,
      agentId: goldenId('mk_agent_a1'),
      memberId: goldenId('mk_member_1'),
      note: 'Welcome call for new member',
      dueAt: at(-1 * 24 * 60 * 60 * 1000), // Yesterday
    },
    {
      id: goldenId('ks_member_followup_workflow'),
      tenantId: TENANTS.KS,
      agentId: goldenId('ks_agent_a1'),
      memberId: goldenId('ks_a_member_1'),
      note: 'Workflow Test Item',
      dueAt: at(-1 * 24 * 60 * 60 * 1000), // Yesterday (Always Overdue)
    },
    {
      id: goldenId('ks_member_followup_lite_1'),
      tenantId: TENANTS.KS,
      agentId: goldenId('ks_agent_lite_1'),
      memberId: goldenId('ks_a_member_3'),
      note: 'Lite agent follow-up (E2E)',
      dueAt: at(), // Today
    },
  ];

  // Explicitly delete to ensure fresh state (reset status to pending)
  const followupIds = realMemberFollowups.map(f => f.id);
  await db.delete(schema.memberFollowups).where(inArray(schema.memberFollowups.id, followupIds));

  for (const f of realMemberFollowups) {
    await db
      .insert(schema.memberFollowups)
      .values({
        ...f,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: schema.memberFollowups.id,
        set: { status: 'pending', dueAt: f.dueAt, note: f.note },
      });
  }

  console.log('✅ Golden Seed Baseline & KS Pack Complete!');
}

// Pure module - CLI execution removed. Use seed.ts runner only.
