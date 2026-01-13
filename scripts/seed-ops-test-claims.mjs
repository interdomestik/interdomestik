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
 * Seed script for Ops Center test claims.
 * Creates claims across all KPI categories for comprehensive testing.
 */
async function seedOpsClaims() {
  console.log('🌱 Seeding Ops Center test claims (Enriched)...\n');
  console.log(`📍 Tenant: ${TENANT_ID}\n`);

  const staff = await getStaffUser();
  const member = await getMemberUser();
  const branchId = await getBranchId();

  if (!staff || !member) {
    console.error('❌ Need at least one staff and one member. Run seed-e2e-users.mjs first.');
    process.exit(1);
  }

  const staffId = staff.id;
  const memberId = member.id;

  async function addDocuments(claimId, uploaderId, date) {
    const docs = [
      { name: 'invoice_repair.pdf', type: 'application/pdf', cat: 'receipt' },
      { name: 'damage_photo_1.jpg', type: 'image/jpeg', cat: 'evidence' },
      { name: 'identification_doc.png', type: 'image/png', cat: 'evidence' },
    ];

    for (const doc of docs) {
      if (Math.random() > 0.5) {
        await sql`
          INSERT INTO claim_documents (
            id, tenant_id, claim_id, name, file_path, file_type, file_size, category, uploaded_by, created_at
          ) VALUES (
            ${nanoid(12)}, ${TENANT_ID}, ${claimId}, ${doc.name}, ${`seeding/${doc.name}`}, 
            ${doc.type}, ${Math.floor(Math.random() * 500000) + 100000}, ${doc.cat}, ${uploaderId}, ${date}
          ) ON CONFLICT DO NOTHING;
        `;
      }
    }
  }

  async function addMessages(claimId, mId, sId, date) {
    const thread = [
      {
        senderId: mId,
        content: 'Përshëndetje, po dërgoj kërkesën për rimbursim.',
        internal: false,
        offset: 0,
      },
      {
        senderId: sId,
        content: 'Faleminderit. Jemi duke e shqyrtuar dokumentacionin.',
        internal: false,
        offset: 10 * 60 * 1000,
      },
      {
        senderId: sId,
        content: 'SHËNIM: Dokumenti i ID-së duket i paqartë. Mund të kërkojmë prapë.',
        internal: true,
        offset: 30 * 60 * 1000,
      },
    ];

    if (sId) {
      for (const msg of thread) {
        const msgDate = new Date(date.getTime() + msg.offset);
        await sql`
          INSERT INTO claim_messages (
            id, tenant_id, claim_id, sender_id, content, is_internal, created_at
          ) VALUES (
            ${nanoid(12)}, ${TENANT_ID}, ${claimId}, ${msg.senderId}, ${msg.content}, ${msg.internal}, ${msgDate}
          ) ON CONFLICT DO NOTHING;
        `;
      }
    }
  }

  async function addHistory(claimId, finalStatus, sId, date) {
    const stages = [
      'draft',
      'submitted',
      'evaluation',
      'negotiation',
      'verification',
      'resolved',
      'rejected',
    ];
    const finalIdx = stages.indexOf(finalStatus);

    if (finalIdx === -1) return;

    for (let i = 0; i <= finalIdx; i++) {
      const status = stages[i];
      const stageDate = new Date(date.getTime() + i * 3600000); // 1 hour steps
      await sql`
        INSERT INTO claim_stage_history (
          id, tenant_id, claim_id, to_status, from_status, changed_by_id, created_at, note
        ) VALUES (
          ${nanoid(12)}, ${TENANT_ID}, ${claimId}, ${status}, ${i > 0 ? stages[i - 1] : null}, ${sId || memberId}, ${stageDate}, 
          ${`Tranzicion automatik në ${status}`}
        ) ON CONFLICT DO NOTHING;
      `;
    }
  }

  const scenarios = [
    {
      prefix: 'sla',
      status: 'submitted',
      staffId: null,
      daysOld: 8,
      count: 2,
      desc: 'Kërkesë e paprocesuar (SLA Breach)',
      category: 'retail',
    },
    {
      prefix: 'stuck',
      status: 'evaluation',
      staffId: staffId,
      daysOld: 12,
      count: 2,
      desc: 'Rast i bllokuar në vlerësim',
      category: 'services',
    },
    {
      prefix: 'negotiation',
      status: 'negotiation',
      staffId: staffId,
      daysOld: 2,
      count: 3,
      desc: 'Në negocim me siguruesin',
      category: 'retail',
    },
    {
      prefix: 'verification',
      status: 'verification',
      staffId: staffId,
      daysOld: 1,
      count: 2,
      desc: 'Duke pritur verifikimin nga klienti',
      category: 'claims',
    },
  ];

  let totalCreated = 0;

  for (const scenario of scenarios) {
    for (let i = 0; i < scenario.count; i++) {
      const id = `ops-enriched-${scenario.prefix}-${i}-${nanoid(4)}`;
      const date = daysAgo(scenario.daysOld);
      const title = `${scenario.desc} [${i + 1}]`;
      const description = `Ky është një rast testues i pasuruar për skenarin: ${scenario.desc}. \n\nDetaje: Krijuar para ${scenario.daysOld} ditësh. Përmban dokumente, mesazhe dhe histori të plotë.`;

      await sql`
        INSERT INTO claim (
          id, tenant_id, "userId", branch_id, "staffId",
          title, description, status, category, "companyName", 
          amount, currency, "createdAt", "updatedAt", "statusUpdatedAt"
        ) VALUES (
          ${id}, ${TENANT_ID}, ${memberId}, ${branchId}, ${scenario.staffId},
          ${title}, ${description}, ${scenario.status}, ${scenario.category}, ${'Siguria Kosova'},
          ${(Math.random() * 500).toFixed(2)}, ${'EUR'}, ${date}, ${date}, ${date}
        )
        ON CONFLICT (id) DO UPDATE SET
          status = excluded.status,
          "staffId" = excluded."staffId",
          "updatedAt" = excluded."updatedAt";
      `;

      await addDocuments(id, memberId, date);
      await addMessages(id, memberId, scenario.staffId, date);
      await addHistory(id, scenario.status, scenario.staffId, date);

      totalCreated++;
    }
  }

  console.log(`\n✅ Enriched ${totalCreated} claims with documents, messages, and history.`);
  await sql.end({ timeout: 5 });
}

seedOpsClaims().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
