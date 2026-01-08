import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

// Force load .env from project root
dotenv.config({ path: resolve(__dirname, '../../../.env') });

async function seedE2E() {
  console.log('🌱 Seeding E2E test data...');

  const DEFAULT_TENANT_ID = 'tenant_mk';

  // Use dynamic import
  const { db } = await import('./db');
  const { user, claims, claimMessages, claimDocuments, claimStageHistory } =
    await import('./schema');
  const { branches } = await import('./schema/rbac');

  const { eq } = await import('drizzle-orm');

  // 1a. Create Branches
  const branchA = {
    id: 'branch-a',
    name: 'Branch A (Main)',
    slug: 'branch-a',
    tenantId: DEFAULT_TENANT_ID,
  };
  const branchB = {
    id: 'branch-b',
    name: 'Branch B (Remote)',
    slug: 'branch-b',
    tenantId: DEFAULT_TENANT_ID,
  };

  console.assert(branchA.id !== branchB.id, 'Sanity Check: Branch IDs must differ');

  await db
    .insert(branches)
    .values([branchA, branchB])
    .onConflictDoUpdate({ target: branches.id, set: { name: branches.name } });

  // 1b. Create Test Users
  // Emails must match those in apps/web/e2e/fixtures/auth.fixture.ts
  const users = [
    {
      id: 'e2e-member-1',
      name: 'Test Member',
      email: 'test@interdomestik.com',
      emailVerified: true,
      tenantId: DEFAULT_TENANT_ID,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'e2e-agent-1',
      name: 'Test Agent',
      email: 'agent@interdomestik.com',
      emailVerified: true,
      tenantId: DEFAULT_TENANT_ID,
      role: 'agent',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'e2e-staff-1',
      name: 'Test Staff',
      email: 'staff@interdomestik.com',
      emailVerified: true,
      tenantId: DEFAULT_TENANT_ID,
      role: 'staff',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'e2e-admin-1',
      name: 'Test Admin',
      email: 'admin@interdomestik.com',
      emailVerified: true,
      tenantId: DEFAULT_TENANT_ID,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'e2e-bm-1',
      name: 'Branch Manager A',
      email: 'bm@interdomestik.com',
      emailVerified: true,
      tenantId: DEFAULT_TENANT_ID,
      branchId: branchA.id,
      role: 'branch_manager',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const u of users) {
    if (u.role === 'branch_manager') {
      console.assert(u.branchId === branchA.id, 'Sanity Check: BM must be assigned to Branch A');
    }

    await db
      .insert(user)
      .values(u)
      .onConflictDoUpdate({
        target: user.email,
        set: {
          name: u.name,
          role: u.role,
          branchId: u.branchId, // Ensure branchId is updated/set
        },
      });
  }

  // 2. Fetch actual IDs (in case users already existed with different IDs)
  const memberUser = await db.query.user.findFirst({
    where: eq(user.email, 'test@interdomestik.com'),
  });
  const agentUser = await db.query.user.findFirst({
    where: eq(user.email, 'agent@interdomestik.com'),
  });

  if (!memberUser || !agentUser) {
    throw new Error('Failed to find seeded users after insert');
  }

  // 3. Assign Member to Agent
  await db.update(user).set({ agentId: agentUser.id }).where(eq(user.id, memberUser.id));

  // 4. Create Claims for the Member
  const e2eClaims = [
    {
      title: 'Car Accident - Rear Ended',
      status: 'submitted',
      category: 'vehicle',
      companyName: 'State Farm',
      claimAmount: '1500.00',
      branchId: branchA.id, // Explicitly in Branch A
    },
    {
      title: 'Flight Delay to Munich',
      status: 'verification',
      category: 'travel',
      companyName: 'Austrian Airlines',
      claimAmount: '600.00',
      branchId: branchB.id, // Explicitly in Branch B
    },
    {
      title: 'Rejected Insurance Claim',
      status: 'rejected',
      category: 'property',
      companyName: 'Allianz',
      claimAmount: '5000.00',
      description: 'Water damage claim rejected',
      branchId: branchA.id,
    },
    {
      title: 'Defective Laptop',
      status: 'draft',
      category: 'retail',
      companyName: 'Apple',
      claimAmount: '2000.00',
      branchId: branchA.id,
    },
    {
      title: 'Water Damage in Apartment',
      status: 'submitted',
      category: 'property',
      companyName: 'Sigal',
      claimAmount: '750.00',
      branchId: branchB.id,
    },
  ];

  // Clear existing claims to avoid duplicates (and handle FKs)
  const existingClaims = await db.query.claims.findMany({
    where: eq(claims.userId, memberUser.id),
    columns: { id: true },
  });

  if (existingClaims.length > 0) {
    const claimIds = existingClaims.map(c => c.id);
    const { inArray } = await import('drizzle-orm');

    // Delete dependencies first
    await db.delete(claimMessages).where(inArray(claimMessages.claimId, claimIds));
    await db.delete(claimDocuments).where(inArray(claimDocuments.claimId, claimIds));
    await db.delete(claimStageHistory).where(inArray(claimStageHistory.claimId, claimIds));

    // Now delete claims
    await db.delete(claims).where(eq(claims.userId, memberUser.id));
  }

  for (const [index, c] of e2eClaims.entries()) {
    // Deterministic ID for testing: claim-branch-a-1, claim-branch-b-1
    const deterministicId = `claim-${c.branchId}-${index + 1}`;
    await db.insert(claims).values({
      id: deterministicId,
      tenantId: DEFAULT_TENANT_ID,
      userId: memberUser.id,
      title: c.title,
      status: c.status as any,
      category: c.category,
      companyName: c.companyName,
      claimAmount: c.claimAmount,
      description: c.description || 'Seeded for E2E testing',
      currency: 'EUR',
      branchId: c.branchId, // Seeded branch
      createdAt: new Date(),
    });
  }

  console.log('✅ E2E seeded successfully!');
  process.exit(0);
}

try {
  await seedE2E();
} catch (err) {
  console.error('❌ E2E seeding failed:', err);
  process.exit(1);
}
