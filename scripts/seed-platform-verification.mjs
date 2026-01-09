import { randomBytes, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

/**
 * DETERMINISTIC PLATFORM SEED
 * Purpose: Verify RBAC constraints, Dashboard KPIs, and Cross-Tenant Isolation.
 *
 * DO NOT EDIT IDS. These are used in Golden Snapshot tests.
 */

// --- 1. CONFIG & HELPERS ---

const SCRYPT_PARAMS = {
  N: 16384,
  r: 16,
  p: 1,
  keyLength: 64,
  maxmem: 128 * 16384 * 16 * 2,
};

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });
  return `${salt}:${key.toString('hex')}`;
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
  } catch (e) {}
}

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required.');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);
const NOW = new Date('2026-01-01T12:00:00Z'); // Fixed time for determinism where possible

// --- 2. DATA DEFINITIONS ---

const TENANTS = [
  { id: 'tenant_ks', name: 'Interdomestik Kosovo', countryCode: 'XK', currency: 'EUR' },
  { id: 'tenant_mk', name: 'Interdomestik Macedonia', countryCode: 'MK', currency: 'MKD' },
];

const BRANCHES = [
  {
    id: 'branch_ks_a',
    tenantId: 'tenant_ks',
    name: 'Prishtina Branch',
    code: 'PR',
    city: 'Prishtina',
  },
  { id: 'branch_ks_b', tenantId: 'tenant_ks', name: 'Prizren Branch', code: 'PZ', city: 'Prizren' },
  { id: 'branch_mk_a', tenantId: 'tenant_mk', name: 'Skopje Branch', code: 'SK', city: 'Skopje' },
  { id: 'branch_mk_b', tenantId: 'tenant_mk', name: 'Bitola Branch', code: 'BT', city: 'Bitola' },
];

const ROLES = {
  SUPER: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  STAFF: 'staff',
  BRANCH_MANAGER: 'branch_manager',
  AGENT: 'agent',
  MEMBER: 'user', // "user" in db implies member
};

// Users are generated via helper to ensure relations
const USERS = [];
const AGENT_CLIENT_LINKS = [];
const SUBSCRIPTIONS = [];
const CLAIMS = [];

// --- 3. UPSERT QUERY HELPERS ---

async function upsertTenant({ id, name, countryCode, currency }) {
  await sql`
    insert into tenants (id, name, legal_name, country_code, currency, is_active, created_at, updated_at)
    values (${id}, ${name}, ${name}, ${countryCode}, ${currency}, true, ${NOW}, ${NOW})
    on conflict (id) do update set
      name = excluded.name,
      legal_name = excluded.legal_name,
      country_code = excluded.country_code,
      currency = excluded.currency,
      is_active = true;
  `;
}

async function upsertBranch({ id, tenantId, name, code }) {
  const slug = name.toLowerCase().replace(/ /g, '-');
  await sql`
    insert into branches (id, tenant_id, name, code, slug, is_active, created_at, updated_at)
    values (${id}, ${tenantId}, ${name}, ${code}, ${slug}, true, ${NOW}, ${NOW})
    on conflict (id) do update set
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      code = excluded.code;
  `;
}

async function upsertUser({ id, name, email, role, tenantId, branchId, agentId, password }) {
  const hash = hashPassword(password);

  // Cleanup dependents
  await sql`delete from subscriptions where "user_id" = ${id} or agent_id = ${id}`;
  await sql`delete from agent_clients where agent_id = ${id} or member_id = ${id}`;
  // Claims have dependencies too
  await sql`delete from claim_messages where "claim_id" in (select id from claim where "userId" = ${id})`;
  await sql`delete from claim_documents where "claim_id" in (select id from claim where "userId" = ${id})`;
  await sql`delete from claim_stage_history where "claim_id" in (select id from claim where "userId" = ${id})`;
  await sql`delete from claim where "userId" = ${id} or agent_id = ${id} or "staffId" = ${id}`;
  await sql`delete from audit_log where "actor_id" = ${id}`;
  await sql`delete from account where "userId"=${id}`;
  await sql`delete from "user" where id=${id}`;

  // Insert User
  await sql`
    insert into "user" (id, name, email, "emailVerified", role, "tenant_id", "branch_id", "agentId", "createdAt", "updatedAt")
    values (${id}, ${name}, ${email}, true, ${role}, ${tenantId || null}, ${branchId || null}, ${agentId || null}, ${NOW}, ${NOW})
    on conflict (id) do update set
      email = excluded.email,
      role = excluded.role,
      "tenant_id" = excluded."tenant_id",
      "branch_id" = excluded."branch_id";
  `;

  // Insert Credential
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${id + '-creds'}, ${email}, 'credential', ${id}, ${hash}, ${NOW}, ${NOW})
    on conflict (id) do update set password = excluded.password;
  `;
}

async function upsertAgentClient({ id, tenantId, agentId, memberId }) {
  await sql`
    insert into agent_clients (id, tenant_id, agent_id, member_id, status, joined_at, created_at)
    values (${id}, ${tenantId}, ${agentId}, ${memberId}, 'active', ${NOW}, ${NOW})
    on conflict (tenant_id, agent_id, member_id) do nothing;
  `;
}

async function upsertSubscription({ id, tenantId, userId, agentId, branchId, status }) {
  await sql`
    insert into subscriptions (id, tenant_id, user_id, status, plan_id, current_period_end, agent_id, branch_id)
    values (${id}, ${tenantId}, ${userId}, ${status}, 'standard', ${new Date('2027-01-01')}, ${agentId}, ${branchId})
    on conflict (id) do update set status = excluded.status;
  `;
}

async function upsertClaim({
  id,
  tenantId,
  userId,
  agentId,
  branchId,
  staffId,
  status,
  amount,
  title,
  companyName = 'Test Company',
}) {
  await sql`
    insert into claim (id, tenant_id, "userId", agent_id, branch_id, "staffId", title, description, status, category, "companyName", amount, currency, "createdAt", "updatedAt")
    values (${id}, ${tenantId}, ${userId}, ${agentId}, ${branchId}, ${staffId}, ${title}, 'Test Claim', ${status}, 'auto', ${companyName}, ${amount}, 'EUR', ${NOW}, ${NOW})
    on conflict (id) do update set status = excluded.status;
  `;
}

// --- 4. POPULATION LOGIC ---

function defineUsers() {
  const PASSWORD = 'VerifyPassword123!';

  // 1. Super Admin (Must have a tenant for DB constraint, usually HQ or Default)
  USERS.push({
    id: 'super_admin_v',
    name: 'Super Admin Verify',
    email: 'super@verify.com',
    role: ROLES.SUPER,
    tenantId: 'tenant_mk',
    branchId: null,
    password: PASSWORD,
  });

  // 2. Per Tenant Roles
  TENANTS.forEach(tenant => {
    // Tenant Admin
    USERS.push({
      id: `admin_${tenant.id}`,
      name: `Admin ${tenant.name}`,
      email: `admin.${tenant.id}@verify.com`,
      role: ROLES.TENANT_ADMIN,
      tenantId: tenant.id,
      branchId: null,
      password: PASSWORD,
    });

    // Staff (Ops)
    USERS.push({
      id: `staff_${tenant.id}`,
      name: `Staff ${tenant.name}`,
      email: `staff.${tenant.id}@verify.com`,
      role: ROLES.STAFF,
      tenantId: tenant.id,
      branchId: null,
      password: PASSWORD,
    });

    const tenantBranches = BRANCHES.filter(b => b.tenantId === tenant.id);

    tenantBranches.forEach((branch, bIdx) => {
      // Branch Manager
      USERS.push({
        id: `manager_${branch.id}`,
        name: `Manager ${branch.code}`,
        email: `manager.${branch.id}@verify.com`,
        role: ROLES.BRANCH_MANAGER,
        tenantId: tenant.id,
        branchId: branch.id,
        password: PASSWORD,
      });

      // Agents (2 per branch)
      for (let i = 1; i <= 2; i++) {
        const agentId = `agent_${branch.id}_${i}`;
        USERS.push({
          id: agentId,
          name: `Agent ${branch.code} ${i}`,
          email: `${agentId}@verify.com`,
          role: ROLES.AGENT,
          tenantId: tenant.id,
          branchId: branch.id,
          password: PASSWORD,
        });

        // Members (3 per agent)
        for (let m = 1; m <= 3; m++) {
          const memberId = `member_${agentId}_${m}`;
          const hasSubscription = m !== 3; // 3rd member has no sub
          const hasClaim = m !== 2; // 2nd member has no claim

          USERS.push({
            id: memberId,
            name: `Member ${agentId} ${m}`,
            email: `${memberId}@verify.com`,
            role: ROLES.MEMBER,
            tenantId: tenant.id,
            branchId: branch.id,
            agentId: agentId,
            password: PASSWORD,
          });

          // Link Agent-Client
          AGENT_CLIENT_LINKS.push({
            id: `link_${memberId}`,
            tenantId: tenant.id,
            agentId: agentId,
            memberId: memberId,
          });

          // Subscription
          if (hasSubscription) {
            SUBSCRIPTIONS.push({
              id: `sub_${memberId}`,
              tenantId: tenant.id,
              userId: memberId,
              agentId: agentId,
              branchId: branch.id,
              status: m === 1 ? 'active' : 'past_due',
            });
          }

          // Claim
          if (hasClaim) {
            CLAIMS.push({
              id: `claim_${memberId}`,
              tenantId: tenant.id,
              userId: memberId,
              agentId: agentId,
              branchId: branch.id,
              status: m === 1 ? 'submitted' : 'resolved',
              amount: (100 * m).toString(),
              title: `Claim for ${memberId}`,
              staffId: `staff_${tenant.id}`,
            });
          }
        }
      }
    });
  });
}

// --- 5. EXECUTION ---

async function main() {
  console.log('🚀 Starting Deterministic Platform Seeding...');

  // A. WIPE (Careful order)
  const allIds = USERS.map(u => u.id); // Only wipe verify users ideally, but verifying full env means we usually wipe all. Here we stick to ID based wipes in helpers.
  // Actually, to ensure clean state for verification, we should delete by ID pattern?
  // For safety, this script will Upsert everything. To ensure no "extra" data, manual cleanup might be needed if DB is dirty.
  // We will assume a "clean-ish" DB or that these IDs don't collide with prod.

  // B. TENANTS & BRANCHES
  for (const t of TENANTS) await upsertTenant(t);
  console.log(`✅ Seeded ${TENANTS.length} Tenants`);

  for (const b of BRANCHES) await upsertBranch(b);
  console.log(`✅ Seeded ${BRANCHES.length} Branches`);

  // C. DATA PREP
  defineUsers();

  // D. USERS
  for (const u of USERS) await upsertUser(u);
  console.log(`✅ Seeded ${USERS.length} Users`);

  // E. LINKS
  for (const l of AGENT_CLIENT_LINKS) await upsertAgentClient(l);
  console.log(`✅ Seeded ${AGENT_CLIENT_LINKS.length} Agent-Client Links`);

  // F. SUBSCRIPTIONS
  for (const s of SUBSCRIPTIONS) await upsertSubscription(s);
  console.log(`✅ Seeded ${SUBSCRIPTIONS.length} Subscriptions`);

  // G. CLAIMS
  for (const c of CLAIMS) await upsertClaim(c);
  console.log(`✅ Seeded ${CLAIMS.length} Claims`);

  // H. SUMMARY
  console.table({
    Tenants: TENANTS.length,
    Branches: BRANCHES.length,
    Users: USERS.length,
    Claims: CLAIMS.length,
  });

  console.log('✨ Seeding Complete. Ready for Verification.');
  await sql.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
