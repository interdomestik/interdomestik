import type { SeedConfig } from '../seed-types';
import { hashPassword } from '../seed-utils/hash-password';
import { packId } from '../seed-utils/seed-ids';

export async function seedAgentPack(config: SeedConfig) {
  console.log('🕴️ Seeding Agent Pack...');
  const { db } = await import('../db');
  // Import schema from root src/schema.ts re-export
  const schema = await import('../schema');

  const ctx = {
    user: schema.user,
    account: schema.account,
    tenants: schema.tenants,
    agentSettings: schema.agentSettings,
    agentClients: schema.agentClients,
    agentCommissions: schema.agentCommissions,
    subscriptions: schema.subscriptions,
  };

  const TENANT_ID = 'tenant_ks';

  // 1. Create Agent User
  const agentEmail = 'agent@interdomestik.local';
  const agentUserId = packId('agent', 'agon');
  const agentPasswordHash = await hashPassword('password123');

  console.log(`Checking Agent: ${agentEmail}`);

  // User
  await db
    .insert(ctx.user)
    .values({
      id: agentUserId,
      tenantId: TENANT_ID,
      email: agentEmail,
      name: 'Agon Agenti',
      role: 'agent',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: ctx.user.id,
      set: { role: 'agent' }, // Ensure role constraint
    });

  // Account (Credentials)
  await db
    .insert(ctx.account)
    .values({
      id: packId('agent', 'agon', 'creds'),
      accountId: agentEmail,
      providerId: 'credential',
      userId: agentUserId,
      password: agentPasswordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  // Agent Settings (Profile)
  await db
    .insert(ctx.agentSettings)
    .values({
      id: packId('agent', 'agon', 'settings'),
      tenantId: TENANT_ID,
      agentId: agentUserId,
      commissionRates: { standard: 15.0 },
      status: 'active',
    } as any)
    .onConflictDoNothing();

  // 2. Create Clients (Members linked to Agent)
  const CLIENTS = [
    { email: 'client.paid@example.com', name: 'Client Paid', status: 'active' },
    { email: 'client.pending@example.com', name: 'Client Pending', status: 'paused' },
  ];

  const seededClients: { id: string; subscriptionId: string | null }[] = [];

  const genericPasswordHash = await hashPassword('password123');

  for (const [i, client] of CLIENTS.entries()) {
    const clientId = packId('agent', 'client', i);

    // User
    await db
      .insert(ctx.user)
      .values({
        id: clientId,
        tenantId: TENANT_ID,
        email: client.email,
        name: client.name,
        role: 'member',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    // Account
    await db
      .insert(ctx.account)
      .values({
        id: packId('agent', 'client', i, 'creds'),
        accountId: client.email,
        providerId: 'credential',
        userId: clientId,
        password: genericPasswordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    // 3. Subscription (if active)
    let subscriptionId: string | undefined;
    if (client.status === 'active' || client.status === 'paused') {
      subscriptionId = packId('agent', 'sub', i);
      await db
        .insert(ctx.subscriptions)
        .values({
          id: subscriptionId,
          tenantId: TENANT_ID,
          userId: clientId,
          planId: 'golden_ks_plan_basic', // Use existing plan from KS golden seed
          status: client.status as any,
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        })
        .onConflictDoNothing();
    }
    seededClients.push({ id: clientId, subscriptionId: subscriptionId ?? null });

    // 4. Link Member to Agent
    await db
      .insert(ctx.agentClients)
      .values({
        id: packId('agent', 'link', i),
        tenantId: TENANT_ID,
        agentId: agentUserId,
        memberId: clientId,
        status: 'active',
        joinedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // 5. Commissions
  const paidMember = seededClients[0];
  if (paidMember && paidMember.subscriptionId) {
    // Check if commission exists (idempotency by ID)
    await db
      .insert(ctx.agentCommissions)
      .values({
        id: packId('agent', 'comm', 'paid'),
        tenantId: TENANT_ID,
        agentId: agentUserId,
        memberId: paidMember.id,
        subscriptionId: paidMember.subscriptionId,
        type: 'new_membership',
        status: 'paid',
        amount: '50.00',
        currency: 'EUR',
        earnedAt: new Date(),
        paidAt: new Date(),
        metadata: { note: 'Initial seed commission' },
      })
      .onConflictDoNothing();
  }

  const pendingMember = seededClients[1];
  if (pendingMember && pendingMember.subscriptionId) {
    await db
      .insert(ctx.agentCommissions)
      .values({
        id: packId('agent', 'comm', 'pending'),
        tenantId: TENANT_ID,
        agentId: agentUserId,
        memberId: pendingMember.id,
        subscriptionId: pendingMember.subscriptionId,
        type: 'new_membership',
        status: 'pending',
        amount: '125.50',
        currency: 'EUR',
        earnedAt: new Date(),
        metadata: { note: 'Pending seed commission' },
      })
      .onConflictDoNothing();
  }

  // 6. Guarantee Golden Agent Context (Fix-up)
  // Ensure agent.ks.a1 (E2E User) is firmly rooted in a branch
  const goldenAgentId = 'golden_ks_agent_a1'; // Hardcoded or imported
  const targetBranchId = 'ks_branch_a'; // Match Golden Seed definition

  // 6a. Ensure Branch Exists (Safety Net)
  // If seed-golden ran, this exists. If not, this prevents FK error.
  const { branches } = await import('../schema');
  await db
    .insert(branches)
    .values({
      id: targetBranchId,
      name: 'KS Branch A (Agent Pack Guaranteed)',
      tenantId: TENANT_ID,
      slug: 'ks-branch-a-guaranteed',
      code: 'KS-A-FIX',
    })
    .onConflictDoNothing();

  // 6b. Force Assignment
  const { eq } = await import('drizzle-orm');
  await db.update(ctx.user).set({ branchId: targetBranchId }).where(eq(ctx.user.id, goldenAgentId));

  console.log('✅ Agent Pack Applied!');
}
