import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import crypto from 'node:crypto';

const { db } = await import('@interdomestik/database');
const { claims } = await import('@interdomestik/database/schema/claims');
const { user } = await import('@interdomestik/database/schema/auth');
const { eq } = await import('drizzle-orm');

async function main() {
  console.log('[AgentClaim] Connecting to Database...');

  const agentEmail = 'agent.ks.a1@interdomestik.com';
  const memberEmail = 'member.ks.a1@interdomestik.com';

  const agent = await db.query.user.findFirst({ where: eq(user.email, agentEmail) });
  const member = await db.query.user.findFirst({ where: eq(user.email, memberEmail) });

  if (!agent || !member) {
    throw new Error('Could not find Agent or Member users');
  }

  console.log(`[AgentClaim] Agent: ${agent.id}, Member: ${member.id}`);

  console.log('[AgentClaim] Inserting Agent-assisted Claim...');

  const claimId = crypto.randomUUID();
  const tenantId = member.tenantId;

  if (!tenantId) {
    throw new Error('Member is missing tenant attribution; cannot create tenant-safe claim');
  }

  await db.insert(claims).values({
    id: claimId,
    tenantId,
    userId: member.id,
    agentId: agent.id, // Agent Assisted attribution
    title: `Live Pilot Agent Claim #1 - ${new Date().toLocaleTimeString('en-US', { hour12: false })}`,
    category: 'vehicle',
    companyName: 'SIGAL UNIQA Group Austria',
    origin: 'agent',
    status: 'submitted',
    statusUpdatedAt: new Date(),
    createdAt: new Date(),
  });

  console.log(`✅ Agent-assisted claim inserted with ID: ${claimId}`);
  console.log('🎉 DB Agent Claim Simulation Finished Successfully!');
}

try {
  await main();
} catch (err) {
  console.error('[AgentClaim] Error:', err);
  process.exit(1);
}
