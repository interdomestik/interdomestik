import { claims, db, eq, user } from '@interdomestik/database';
import crypto from 'node:crypto';

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

  await db.insert(claims).values({
    id: claimId,
    tenantId: 'tenant_ks', // Verify if this matches
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

main().catch(err => {
  console.error('[AgentClaim] Error:', err);
  process.exit(1);
});
