import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Force load .env from project root
dotenv.config({ path: resolve(__dirname, '../../../.env') });

async function seedE2E() {
  console.log('🌱 Seeding E2E test data...');

  const DEFAULT_TENANT_ID = 'tenant_mk';

  // Use dynamic import
  const { db } = await import('./db');
  const { user, claims, claimMessages, claimDocuments, claimStageHistory } =
    await import('./schema');
  const { nanoid } = await import('nanoid');
  const { eq } = await import('drizzle-orm');

  // 1. Create Test Users
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
  ];

  for (const u of users) {
    await db
      .insert(user)
      .values(u)
      .onConflictDoUpdate({
        target: user.email,
        set: {
          name: u.name,
          role: u.role,
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
    },
    {
      title: 'Flight Delay to Munich',
      status: 'verification',
      category: 'travel',
      companyName: 'Austrian Airlines',
      claimAmount: '600.00',
    },
    {
      title: 'Rejected Insurance Claim',
      status: 'rejected',
      category: 'property',
      companyName: 'Allianz',
      claimAmount: '5000.00',
      description: 'Water damage claim rejected',
    },
    {
      title: 'Defective Laptop',
      status: 'draft',
      category: 'retail',
      companyName: 'Apple',
      claimAmount: '2000.00',
    },
    {
      title: 'Water Damage in Apartment',
      status: 'submitted',
      category: 'property',
      companyName: 'Sigal',
      claimAmount: '750.00',
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

  for (const c of e2eClaims) {
    await db.insert(claims).values({
      id: `e2e-claim-${nanoid(6)}`,
      tenantId: DEFAULT_TENANT_ID,
      userId: memberUser.id,
      title: c.title,
      status: c.status as any,
      category: c.category,
      companyName: c.companyName,
      claimAmount: c.claimAmount,
      description: c.description || 'Seeded for E2E testing',
      currency: 'EUR',
      createdAt: new Date(),
    });
  }

  console.log('✅ E2E seeded successfully!');
  process.exit(0);
}

seedE2E().catch(err => {
  console.error('❌ E2E seeding failed:', err);
  process.exit(1);
});
