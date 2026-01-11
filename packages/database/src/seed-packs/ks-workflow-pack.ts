import { cleanupByPrefixes } from '../seed-utils/cleanup';
import { hashPassword } from '../seed-utils/hash-password';
import { loadEnvFromRoot } from '../seed-utils/load-env';
import { packId } from '../seed-utils/seed-ids';
// Needed imports for sanity check
import { sql } from 'drizzle-orm';

// Force load .env
loadEnvFromRoot();

async function seedKsWorkflowPack() {
  console.log('🇽🇰 Seeding Kosovo Workflow Pack (Overlay)...');

  const { db } = await import('../db');
  const schema = await import('../schema');

  const TENANTS = {
    KS: 'tenant_ks',
  };

  // 1. Cleanup previous Pack Data specifically
  // We only clean "pack_ks_" to allow re-running pack without wiping baseline
  await cleanupByPrefixes(db, schema, ['pack_ks_'], false);

  // 2. Ensure Branches Exist (A/B/C)
  const BRANCHES = [
    {
      id: packId('ks', 'branch_a'), // New ID for Pack variant or use goldenId to overwrite
      name: 'KS PRI Main',
      tenantId: TENANTS.KS,
      slug: 'ks-prishtina-main',
      code: 'KS-PRI-001', // URGENT target
    },
    {
      id: packId('ks', 'branch_b'),
      name: 'KS Prizren West',
      tenantId: TENANTS.KS,
      slug: 'ks-prizren-west',
      code: 'KS-PRZ-001', // ATTENTION target
    },
    {
      id: packId('ks', 'branch_c'),
      name: 'KS Pejë North',
      tenantId: TENANTS.KS,
      slug: 'ks-peja-north',
      code: 'KS-PEJ-001', // HEALTHY target
    },
  ];

  console.log('🌿 Ensuring KS Branches...');
  await db
    .insert(schema.branches)
    .values(BRANCHES)
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: { name: schema.branches.name, code: schema.branches.code },
    });

  // 3. Seed Extra Users (Staff/Agents/Members) for Load
  console.log('👥 Seeding Pack Users...');
  const PACK_PASSWORD = 'GoldenPass123!';
  const hashedPass = hashPassword(PACK_PASSWORD);

  const packUsers = [
    // Extra Staff for Assignments in KS-A
    {
      id: packId('ks', 'staff_extra'),
      name: 'Agim Ramadani',
      email: 'staff.ks.extra@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.KS,
    },
    // Extra Members for Claims
    ...Array.from({ length: 9 }).map((_, i) => ({
      id: packId('ks', 'member', i + 1),
      name: `KS Member ${i + 1}`,
      email: `ks.member.pack.${i + 1}@interdomestik.com`,
      role: 'user',
      tenantId: TENANTS.KS,
    })),
  ];

  for (const u of packUsers) {
    await db
      .insert(schema.user)
      .values({
        ...u,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.user.id, set: { role: u.role } });

    await db
      .insert(schema.account)
      .values({
        id: `${u.id}-credential`,
        accountId: u.email,
        providerId: 'credential',
        userId: u.id,
        password: hashedPass,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.account.id, set: { password: hashedPass } });
  }

  // Helper to get random member ID from pack
  const getPackMemberId = (idx: number) => packId('ks', 'member', (idx % 9) + 1);

  // 4. Seed Data by Branch Health Recipe

  // === KS-A (URGENT) ===
  // 18 Open Claims:
  // - 6 submitted
  // - 4 verification
  // - 4 evaluation
  // - 3 negotiation
  // - 1 court
  // + 2 SLA Breaches (Submitted, old dates)
  // + 3 Cash Pending Leads

  console.log('🚨 Seeding URGENT Data (KS-A)...');
  const ksA_OpenClaims = [
    ...Array(6).fill('submitted'),
    ...Array(4).fill('verification'),
    ...Array(4).fill('evaluation'),
    ...Array(3).fill('negotiation'),
    ...Array(1).fill('court'),
  ];

  for (const [i, status] of ksA_OpenClaims.entries()) {
    await db
      .insert(schema.claims)
      .values({
        id: packId('ks', 'claim', 'ks_a', i),
        userId: getPackMemberId(i),
        tenantId: TENANTS.KS,
        branchId: 'ks_branch_a',
        status: status as any,
        title: `KS-A Claim ${status} ${i}`,
        category: 'vehicle',
        companyName: 'Test Insurer',
        claimAmount: '500.00',
        currency: 'EUR',
        createdAt: new Date(), // New
      })
      .onConflictDoNothing();
  }

  // SLA Breaches (2 claims)
  const slaDates = [35, 45]; // days ago
  for (const [i, days] of slaDates.entries()) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    await db
      .insert(schema.claims)
      .values({
        id: packId('ks', 'claim', 'ks_a', 'sla', i),
        userId: getPackMemberId(i),
        tenantId: TENANTS.KS,
        branchId: 'ks_branch_a',
        status: 'submitted', // counted as open
        title: `KS-A SLA Breach ${days}d`,
        category: 'vehicle',
        companyName: 'Test Insurer',
        claimAmount: '1000.00',
        currency: 'EUR',
        createdAt: date,
      })
      .onConflictDoNothing();
  }

  // Cash Pending Leads (3 leads)
  const cashDates = [2, 4, 7]; // days ago
  for (const [i, days] of cashDates.entries()) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const leadId = packId('ks', 'lead', 'ks_a', i);

    await db
      .insert(schema.memberLeads)
      .values({
        id: leadId,
        tenantId: TENANTS.KS,
        branchId: 'ks_branch_a',
        // assigned to baseline admin or agent just to have an owner
        agentId: 'golden_ks_admin',
        firstName: `CashLead ${i}`,
        lastName: 'Urgent',
        email: `cash.${i}@ks.pack`,
        phone: `+3834400000${i}`, // ADDED PHONE to satisfy constraint
        status: 'payment_pending',
        createdAt: date,
        updatedAt: date,
      })
      .onConflictDoNothing();

    await db
      .insert(schema.leadPaymentAttempts)
      .values({
        id: packId('ks', 'pay', 'ks_a', i),
        tenantId: TENANTS.KS,
        leadId: leadId,
        method: 'cash',
        status: 'pending',
        amount: 10000,
        currency: 'EUR',
        createdAt: date,
      })
      .onConflictDoNothing();
  }

  // === KS-B (ATTENTION) ===
  // 9 Open Claims:
  // - 4 submitted
  // - 2 verification
  // - 2 evaluation
  // - 1 negotiation
  // + 1 Cash Pending (3 days ago)
  // No SLA
  console.log('⚠️  Seeding ATTENTION Data (KS-B)...');

  const ksB_OpenClaims = [
    ...Array(4).fill('submitted'),
    ...Array(2).fill('verification'),
    ...Array(2).fill('evaluation'),
    ...Array(1).fill('negotiation'),
  ];

  for (const [i, status] of ksB_OpenClaims.entries()) {
    await db
      .insert(schema.claims)
      .values({
        id: packId('ks', 'claim', 'ks_b', i),
        userId: getPackMemberId(i),
        tenantId: TENANTS.KS,
        branchId: 'ks_branch_b',
        status: status as any,
        title: `KS-B Claim ${status} ${i}`,
        category: 'vehicle',
        companyName: 'Test Insurer',
        claimAmount: '300.00',
        currency: 'EUR',
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // 1 Cash Pending
  const dateB = new Date();
  dateB.setDate(dateB.getDate() - 3);
  const leadIdB = packId('ks', 'lead', 'ks_b', 1);

  await db
    .insert(schema.memberLeads)
    .values({
      id: leadIdB,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_b',
      agentId: 'golden_ks_admin',
      firstName: `CashLead B`,
      lastName: 'Attention',
      email: `cash.b@ks.pack`,
      phone: `+38344000099`, // ADDED PHONE
      status: 'payment_pending',
      createdAt: dateB,
      updatedAt: dateB,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.leadPaymentAttempts)
    .values({
      id: packId('ks', 'pay', 'ks_b', 1),
      tenantId: TENANTS.KS,
      leadId: leadIdB,
      method: 'cash',
      status: 'pending',
      amount: 10000,
      currency: 'EUR',
      createdAt: dateB,
    })
    .onConflictDoNothing();

  // === KS-C (HEALTHY) ===
  // 2 Open Claims: 1 submitted, 1 verification
  // 0 Cash Pending, 0 SLA
  console.log('✅ Seeding HEALTHY Data (KS-C)...');
  const ksC_OpenClaims = ['submitted', 'verification'];

  for (const [i, status] of ksC_OpenClaims.entries()) {
    await db
      .insert(schema.claims)
      .values({
        id: packId('ks', 'claim', 'ks_c', i),
        userId: getPackMemberId(i),
        tenantId: TENANTS.KS,
        branchId: packId('ks', 'branch_c'),
        status: status as any,
        title: `KS-C Claim ${status} ${i}`,
        category: 'vehicle',
        companyName: 'Test Insurer',
        claimAmount: '150.00',
        currency: 'EUR',
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // === SANITY CHECK LOG ===
  // Query counts to confirm pack effect
  console.log('\n🔍 --- KS Pack Sanity Check ---');

  // Helper to count
  const countClaims = async (branchId: string) => {
    const res = await db
      .select({ count: schema.claims.id })
      .from(schema.claims)
      .where(
        sql`${schema.claims.branchId} = ${branchId} AND ${schema.claims.status} IN ('draft', 'submitted', 'verification', 'evaluation', 'negotiation', 'court')`
      ); // Simplified open check
    return res.length; // Actually select count(*) is better but this is fine for small seed
  };

  const aCount = await countClaims('ks_branch_a');
  const bCount = await countClaims('ks_branch_b');
  const cCount = await countClaims(packId('ks', 'branch_c'));

  console.log(`KS-A (Urgent) Open Claims: ${aCount} (Expected ~20 including SLA)`);
  console.log(`KS-B (Attention) Open Claims: ${bCount} (Expected ~9)`);
  console.log(`KS-C (Healthy) Open Claims: ${cCount} (Expected ~2)`);

  console.log('🇽🇰 KS Workflow Pack Applied Successfully!');
  process.exit(0);
}

seedKsWorkflowPack().catch(e => {
  console.error(e);
  process.exit(1);
});
