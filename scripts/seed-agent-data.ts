import fs from 'node:fs';
import path from 'node:path';

// Load .env manually
function loadEnv() {
  const possiblePaths = [
    path.resolve(process.cwd(), '../../.env'), // Prioritize root .env (if running from package)
    path.resolve(process.cwd(), '.env'),
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      console.log(`Loading .env from ${envPath}`);
      const envFile = fs.readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      return;
    }
  }
}
loadEnv();

// Keep loadEnv and pure imports
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function seedAgentData() {
  console.log('🌱 Seeding Agent Data for agent@interdomestik.com...');

  // 0. Load Dependencies Dynamically (after env is loaded)
  // Use relative paths to avoid alias resolution issues in scripts/ folder
  const { db } = await import('../packages/database/src/db');
  const { agentCommissions, crmDeals, crmLeads, subscriptions, user } =
    await import('../packages/database/src/schema');

  const AGENT_EMAIL = 'agent@interdomestik.com';

  // 1. Ensure Agent User Exists
  let agent = await db.query.user.findFirst({
    where: eq(user.email, AGENT_EMAIL),
  });

  if (!agent) {
    console.log('Creating agent user...');
    const agentId = uuidv4();
    await db.insert(user).values({
      id: agentId,
      email: AGENT_EMAIL,
      name: 'Agent User',
      role: 'agent',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    agent = { id: agentId } as any;
  } else {
    console.log(`Agent found: ${agent.id}`);
    // Ensure role is agent
    if (agent.role !== 'agent') {
      await db.update(user).set({ role: 'agent' }).where(eq(user.id, agent.id));
    }
  }

  const agentId = agent!.id;

  // 2. Clear existing data for a clean slate
  console.log('Cleaning old data...');
  // Delete referencing tables first
  await db.delete(agentCommissions).where(eq(agentCommissions.agentId, agentId));
  // Note: We need to find memberIds for this agent to delete agent_clients properly if we want to be thorough,
  // but for now deleting by agentId is enough if the schema allows it.
  // Actually agent_clients has agentId.
  // Import agentClients first.
  const { agentClients } = await import('../packages/database/src/schema');
  await db.delete(agentClients).where(eq(agentClients.agentId, agentId));

  await db.delete(crmDeals).where(eq(crmDeals.agentId, agentId));
  await db.delete(crmLeads).where(eq(crmLeads.agentId, agentId));

  // 3. Create Leads (3 New, 2 Contacted)
  console.log('Creating Leads...');
  const newLeadsData = [
    { name: 'Arben Lila', company: 'Tech Corp' },
    { name: 'Sarah Connor', company: 'Skynet Inc' },
    { name: 'John Doe', company: 'Anonymous Ltd' },
  ];

  for (const lead of newLeadsData) {
    await db.insert(crmLeads).values({
      id: uuidv4(),
      agentId,
      type: 'individual',
      fullName: lead.name,
      companyName: lead.company,
      stage: 'new',
      email: `${lead.name.split(' ')[0].toLowerCase()}@example.com`,
      createdAt: new Date(),
    });
  }

  const contactedLeadsData = [
    { name: 'Michael Scott', company: 'Dunder Mifflin' },
    { name: 'Dwight Schrute', company: 'Schrute Farms' },
  ];

  for (const lead of contactedLeadsData) {
    await db.insert(crmLeads).values({
      id: uuidv4(),
      agentId,
      type: 'individual',
      fullName: lead.name,
      companyName: lead.company,
      stage: 'contacted',
      createdAt: new Date(),
    });
  }

  // 4. Create Deals (1 Won, 1 Proposal)
  console.log('Creating Deals...');
  // Create a lead first to attach the deal to
  const wonLeadId = uuidv4();
  await db.insert(crmLeads).values({
    id: wonLeadId,
    agentId,
    type: 'individual',
    fullName: 'Bruce Wayne',
    stage: 'won', // leads table stage
    createdAt: new Date(),
  });

  await db.insert(crmDeals).values({
    id: uuidv4(),
    agentId,
    leadId: wonLeadId,
    stage: 'closed_won',
    valueCents: 12000, // €120
    status: 'closed',
    createdAt: new Date(),
    closedAt: new Date(),
  });

  // 5. Create Clients & Subscriptions (The "Your Clients" metric)
  console.log('Creating Clients...');
  const clients = ['Peter Parker', 'Tony Stark'];
  const seededClients: Array<{ id: string; subscriptionId: string | null }> = [];

  for (const clientName of clients) {
    const email = `${clientName.split(' ')[0].toLowerCase()}.client@example.com`;

    // Check if user exists first to get correct ID
    let client = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (!client) {
      const newId = uuidv4();
      await db.insert(user).values({
        id: newId,
        name: clientName,
        email,
        role: 'user',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      client = { id: newId } as any;
    }

    const clientId = client!.id;

    // Create Active Subscription linked to Agent
    // Check if subscription exists
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, clientId),
    });

    const subscriptionId = existingSub?.id ?? uuidv4();
    if (!existingSub) {
      await db.insert(subscriptions).values({
        id: subscriptionId,
        userId: clientId,
        status: 'active',
        planId: 'family',
        planKey: 'family',
        referredByAgentId: agentId,
        createdAt: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      });
    } else {
      await db
        .update(subscriptions)
        .set({
          status: 'active',
          planId: existingSub.planId ?? 'family',
          planKey: existingSub.planKey ?? 'family',
          referredByAgentId: agentId,
          currentPeriodStart: existingSub.currentPeriodStart ?? new Date(),
          currentPeriodEnd:
            existingSub.currentPeriodEnd ??
            new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        })
        .where(eq(subscriptions.id, existingSub.id));
    }
    seededClients.push({ id: clientId, subscriptionId: subscriptionId ?? null });

    // Link Member to Agent in agent_clients table (CRITICAL FIX)
    // Check if link exists
    const existingLink = await db.query.agentClients.findFirst({
      where: and(eq(agentClients.agentId, agentId), eq(agentClients.memberId, clientId)),
    });

    if (!existingLink) {
      await db.insert(agentClients).values({
        id: uuidv4(),
        agentId: agentId,
        memberId: clientId,
        status: 'active',
        joinedAt: new Date(),
      });
    }
  }

  // 6. Commissions (Paid, Pending)
  console.log('Creating Commissions...');
  const paidMember = seededClients[0];
  const pendingMember = seededClients[1] ?? seededClients[0];
  await db.insert(agentCommissions).values({
    id: uuidv4(),
    agentId,
    memberId: paidMember?.id,
    subscriptionId: paidMember?.subscriptionId ?? undefined,
    type: 'new_membership',
    status: 'paid',
    amount: '50.00',
    currency: 'EUR',
    earnedAt: new Date(),
    paidAt: new Date(),
    metadata: { note: 'Initial seed commission' },
  });

  await db.insert(agentCommissions).values({
    id: uuidv4(),
    agentId,
    memberId: pendingMember?.id,
    subscriptionId: pendingMember?.subscriptionId ?? undefined,
    type: 'new_membership',
    status: 'pending',
    amount: '125.50',
    currency: 'EUR',
    earnedAt: new Date(),
    metadata: { note: 'Pending seed commission' },
  });

  console.log('✅ Seeding Complete!');
  process.exit(0);
}

seedAgentData().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
