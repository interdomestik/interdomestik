/**
 * Seed script for Ops Center test claims.
 * Creates claims across all KPI categories for comprehensive testing.
 *
 * Usage: node scripts/seed-ops-test-claims.mjs
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

function nanoid(len = 6) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

// Load .env
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    });
  } catch (e) {
    /* ignore */
  }
}

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

const TENANT_ID = process.env.SEED_TENANT || 'tenant_ks'; // Default to KS for current session
const BRANCH_ID = null; // Will be auto-resolved

// Get a random staff user from the DB
async function getStaffUser() {
  const rows = await sql`
    SELECT id, name FROM "user" 
    WHERE role = 'staff' AND tenant_id = ${TENANT_ID} 
    LIMIT 1;
  `;
  return rows[0] || null;
}

// Get a random member user
async function getMemberUser() {
  const rows = await sql`
    SELECT id FROM "user" 
    WHERE role = 'user' AND tenant_id = ${TENANT_ID} 
    LIMIT 1;
  `;
  return rows[0] || null;
}

// Get first active branch for tenant
async function getBranchId() {
  const rows = await sql`
    SELECT id FROM branches 
    WHERE tenant_id = ${TENANT_ID} AND is_active = true 
    LIMIT 1;
  `;
  return rows[0]?.id || null;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Generate test claims for all KPI categories
 */
async function seedOpsClaims() {
  console.log('🌱 Seeding Ops Center test claims...\n');
  console.log(`📍 Tenant: ${TENANT_ID}\n`);

  const staff = await getStaffUser();
  const member = await getMemberUser();
  const branchId = await getBranchId();

  if (!staff || !member) {
    console.error('❌ Need at least one staff and one member. Run seed-e2e-users.mjs first.');
    process.exit(1);
  }

  console.log(`👤 Staff: ${staff.name} (${staff.id})`);
  console.log(`👤 Member: ${member.id}`);
  console.log(`🏢 Branch: ${branchId || 'None'}\n`);

  // Define test scenarios
  const scenarios = [
    // SLA Breach claims (old + staff-owned)
    {
      prefix: 'sla',
      status: 'submitted',
      staffId: null,
      daysOld: 8,
      count: 2,
      desc: 'SLA breach (unassigned)',
    },
    {
      prefix: 'sla-assigned',
      status: 'evaluation',
      staffId: staff.id,
      daysOld: 10,
      count: 2,
      desc: 'SLA breach (assigned)',
    },

    // Unassigned staff-owned
    {
      prefix: 'unassigned',
      status: 'submitted',
      staffId: null,
      daysOld: 1,
      count: 3,
      desc: 'Unassigned (fresh)',
    },
    {
      prefix: 'unassigned-eval',
      status: 'evaluation',
      staffId: null,
      daysOld: 2,
      count: 2,
      desc: 'Unassigned evaluation',
    },

    // Stuck claims (5+ days in stage)
    {
      prefix: 'stuck',
      status: 'negotiation',
      staffId: staff.id,
      daysOld: 6,
      count: 2,
      desc: 'Stuck (6 days)',
    },

    // Assigned (happy path)
    {
      prefix: 'assigned',
      status: 'evaluation',
      staffId: staff.id,
      daysOld: 1,
      count: 3,
      desc: 'Assigned & active',
    },
    {
      prefix: 'assigned-neg',
      status: 'negotiation',
      staffId: staff.id,
      daysOld: 2,
      count: 2,
      desc: 'Assigned negotiation',
    },

    // Waiting on member (verification stage)
    {
      prefix: 'waiting',
      status: 'verification',
      staffId: null,
      daysOld: 3,
      count: 3,
      desc: 'Waiting on member',
    },

    // Terminal (should NOT appear in ops)
    {
      prefix: 'resolved',
      status: 'resolved',
      staffId: staff.id,
      daysOld: 30,
      count: 2,
      desc: 'Resolved (terminal)',
    },
    {
      prefix: 'rejected',
      status: 'rejected',
      staffId: staff.id,
      daysOld: 30,
      count: 1,
      desc: 'Rejected (terminal)',
    },

    // Draft (member-owned, not in ops pool)
    {
      prefix: 'draft',
      status: 'draft',
      staffId: null,
      daysOld: 1,
      count: 2,
      desc: 'Draft (member-owned)',
    },

    // Court stage (rare but staff-owned)
    {
      prefix: 'court',
      status: 'court',
      staffId: staff.id,
      daysOld: 15,
      count: 1,
      desc: 'Court stage',
    },
  ];

  let totalCreated = 0;

  for (const scenario of scenarios) {
    console.log(`📦 Creating ${scenario.count}x ${scenario.desc}...`);

    for (let i = 0; i < scenario.count; i++) {
      const id = `ops-test-${scenario.prefix}-${i}-${nanoid(6)}`;
      const createdAt = daysAgo(scenario.daysOld);
      const updatedAt = createdAt; // Same as created for daysInStage accuracy

      await sql`
        INSERT INTO claim (
          id, tenant_id, "userId", branch_id, "staffId",
          title, description, status, category, "companyName", 
          amount, currency, "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${TENANT_ID}, ${member.id}, ${branchId}, ${scenario.staffId},
          ${`Test: ${scenario.desc} #${i + 1}`},
          ${`Auto-generated claim for testing ${scenario.desc}. Created ${scenario.daysOld} days ago.`},
          ${scenario.status}, ${'test'}, ${'Test Co'},
          ${'100.00'}, ${'EUR'}, ${createdAt}, ${updatedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = excluded.status,
          "staffId" = excluded."staffId",
          "updatedAt" = excluded."updatedAt";
      `;
      totalCreated++;
    }
  }

  console.log(`\n✅ Created ${totalCreated} test claims across ${scenarios.length} categories`);

  // Print summary
  console.log('\n📊 Expected KPI impact:');
  console.log('  • SLA Breach: 4 (submitted/evaluation with 8-10 days)');
  console.log('  • Unassigned: 5 (staff-owned without staffId)');
  console.log('  • Stuck: 2 (6+ days in stage)');
  console.log('  • Waiting on Member: 3 (verification status)');
  console.log('  • Terminal (hidden): 3 (resolved/rejected)');
  console.log('  • Draft (hidden): 2 (member-owned)');

  await sql.end({ timeout: 5 });
}

seedOpsClaims().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
