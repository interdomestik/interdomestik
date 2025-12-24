import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

// Simple unique ID generator
const genId = () => crypto.randomBytes(6).toString('hex');

// Load .env manually
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
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
  } catch (e) {
    // Ignore if .env missing
  }
}

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

// Target: agent-user (the main test agent)
const AGENT_ID = 'agent-user';

// We'll create commissions for the linked members
const commissions = [
  {
    id: `comm-seed-${genId()}`,
    agentId: AGENT_ID,
    memberId: 'test-user-0',
    type: 'new_membership',
    status: 'pending',
    amount: '25.00',
    currency: 'EUR',
    earnedAtOffset: 1, // 1 day ago
  },
  {
    id: `comm-seed-${genId()}`,
    agentId: AGENT_ID,
    memberId: 'test-user-1',
    type: 'new_membership',
    status: 'pending',
    amount: '25.00',
    currency: 'EUR',
    earnedAtOffset: 3,
  },
  {
    id: `comm-seed-${genId()}`,
    agentId: AGENT_ID,
    memberId: 'test-user-2',
    type: 'renewal',
    status: 'approved',
    amount: '12.50',
    currency: 'EUR',
    earnedAtOffset: 10,
  },
  {
    id: `comm-seed-${genId()}`,
    agentId: AGENT_ID,
    memberId: 'test-user-3',
    type: 'new_membership',
    status: 'approved',
    amount: '25.00',
    currency: 'EUR',
    earnedAtOffset: 15,
  },
  {
    id: `comm-seed-${genId()}`,
    agentId: AGENT_ID,
    memberId: 'test-user-4',
    type: 'new_membership',
    status: 'paid',
    amount: '25.00',
    currency: 'EUR',
    earnedAtOffset: 30,
    paidAtOffset: 25,
  },
  {
    id: `comm-seed-${genId()}`,
    agentId: AGENT_ID,
    memberId: 'test-user-5',
    type: 'b2b',
    status: 'paid',
    amount: '150.00',
    currency: 'EUR',
    earnedAtOffset: 45,
    paidAtOffset: 40,
  },
];

async function upsertCommission(c) {
  const now = new Date();
  const earnedAt = new Date(Date.now() - 1000 * 60 * 60 * 24 * c.earnedAtOffset);
  const paidAt = c.paidAtOffset
    ? new Date(Date.now() - 1000 * 60 * 60 * 24 * c.paidAtOffset)
    : null;

  await sql`
    INSERT INTO agent_commissions (id, agent_id, member_id, type, status, amount, currency, earned_at, paid_at, metadata)
    VALUES (${c.id}, ${c.agentId}, ${c.memberId}, ${c.type}, ${c.status}, ${c.amount}, ${c.currency}, ${earnedAt}, ${paidAt}, ${'{}'})
    ON CONFLICT (id) DO UPDATE SET
      status = excluded.status,
      amount = excluded.amount,
      paid_at = excluded.paid_at;
  `;
}

async function main() {
  console.log('💰 Seeding commissions for agent:', AGENT_ID);

  // Verify agent exists
  const agent = await sql`SELECT id, name FROM "user" WHERE id = ${AGENT_ID}`;
  if (agent.length === 0) {
    console.error(`Agent ${AGENT_ID} not found. Run 'node scripts/seed-e2e-users.mjs' first.`);
    process.exit(1);
  }
  console.log(`  Found agent: ${agent[0].name}`);

  // Clear old seeded commissions for this agent
  await sql`DELETE FROM agent_commissions WHERE agent_id = ${AGENT_ID};`;
  console.log('  Cleared existing commissions');

  // Insert new commissions
  for (const c of commissions) {
    await upsertCommission(c);
    console.log(`  ✅ Seeded: ${c.type} (${c.status}) - €${c.amount}`);
  }

  await sql.end({ timeout: 5 });
  console.log('✅ Commission seeding complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
