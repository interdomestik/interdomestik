import { randomBytes, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

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

// Load .env manually if not in env
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
    // Ignore error if .env missing
  }
}

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required to seed data');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

const WORKER_COUNT = 10; // Support up to 10 parallel workers

const baseClaims = [
  {
    originalId: 'claim-1',
    title: 'Car Accident - Rear Ended',
    description:
      'I was rear-ended at a red light on George Bush Blvd. The other driver admitted fault.',
    status: 'submitted',
    category: 'auto',
    companyName: 'Sigal',
    amount: '1200.00',
    currency: 'EUR',
    createdAtOffsetDays: 2,
  },
  {
    originalId: 'claim-2',
    title: 'Flight Delay to Munich',
    description: 'My flight to Munich was delayed by 6 hours without explanation.',
    status: 'verification',
    category: 'travel',
    companyName: 'Austrian Airlines',
    amount: '600.00',
    currency: 'EUR',
    createdAtOffsetDays: 5,
  },
  {
    originalId: 'claim-3',
    title: 'Defective Laptop',
    description:
      'The laptop screen started flickering one week after purchase. Vendor refuses warranty.',
    status: 'evaluation',
    category: 'retail',
    companyName: 'TechnoMarket',
    amount: '850.00',
    currency: 'EUR',
    createdAtOffsetDays: 10,
  },
  {
    originalId: 'claim-4',
    title: 'Water Damage in Apartment',
    description: 'Upstairs neighbor had a leak that damaged my ceiling and hardwood floor.',
    status: 'negotiation',
    category: 'real_estate',
    companyName: 'Building Mgmt',
    amount: '2500.00',
    currency: 'EUR',
    createdAtOffsetDays: 20,
  },
  {
    originalId: 'claim-5',
    title: 'Rejected Insurance Claim',
    description: 'Insurance denied coverage for storm damage citing a clause I cannot find.',
    status: 'rejected',
    category: 'insurance',
    companyName: 'Illyria',
    amount: '5000.00',
    currency: 'EUR',
    createdAtOffsetDays: 30,
  },
];

const users = [];
const claims = [];

const DEFAULT_TENANT_ID = 'tenant_mk';

async function getTenantDefaultBranchId(tenantId) {
  const rows = await sql`
    select value
    from tenant_settings
    where tenant_id = ${tenantId} and category = 'rbac' and key = 'default_branch_id'
    limit 1;
  `;

  const value = rows?.[0]?.value;
  const branchId = value?.branchId;
  if (typeof branchId === 'string' && branchId.length > 0) {
    return branchId;
  }

  const fallback = await sql`
    select id
    from branches
    where tenant_id = ${tenantId} and is_active = true
    order by created_at asc
    limit 1;
  `;

  return fallback?.[0]?.id ?? null;
}

// 1. Generate Worker-Specific Users/Agents/Claims
for (let i = 0; i < WORKER_COUNT; i++) {
  // Member
  const userId = `test-user-${i}`;
  // Link member to the corresponding agent (e.g. Member 0 -> Agent 0)
  const agentId = `agent-user-${i}`;

  users.push({
    id: userId,
    name: `Test Member ${i}`,
    email: `test-worker${i}@interdomestik.com`,
    password: 'TestPassword123!',
    role: 'user',
    agentId: agentId,
  });

  // Agent
  users.push({
    id: agentId,
    name: `Support Agent ${i}`,
    email: `agent-worker${i}@interdomestik.com`,
    password: 'AgentPassword123!',
    role: 'agent',
  });

  // Claims for this user
  for (const c of baseClaims) {
    claims.push({
      id: `${c.originalId}-worker${i}`,
      userId: userId,
      title: `${c.title} (Worker ${i})`,
      description: c.description,

      status: c.status,
      category: c.category,
      companyName: c.companyName,
      amount: c.amount,
      currency: c.currency,
      // Assign ALL claims to Staff User for testing simplicity
      staffId: 'staff-user',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * c.createdAtOffsetDays),
    });
  }
}

// 2. Global Users (backward compatibility or shared resources)
users.push({
  id: 'test-user', // Legacy fallback
  name: 'Test Member Legacy',
  email: 'test@interdomestik.com',
  password: 'TestPassword123!',
  role: 'user',
});
users.push({
  id: 'admin-user',
  name: 'Admin User',
  email: 'admin@interdomestik.com',
  password: 'AdminPassword123!',
  role: 'admin',
});
users.push({
  id: 'staff-user',
  name: 'Staff User',
  email: 'staff@interdomestik.com',
  password: 'StaffPassword123!',
  role: 'staff',
});
users.push({
  id: 'agent-user',
  name: 'Agent User',
  email: 'agent@interdomestik.com',
  password: 'AgentPassword123!',
  role: 'agent',
});

// 3. Additional Staff Users for comprehensive testing
for (let i = 0; i < 3; i++) {
  users.push({
    id: `staff-user-${i}`,
    name: `Staff Member ${i}`,
    email: `staff-worker${i}@interdomestik.com`,
    password: 'StaffPassword123!',
    role: 'staff',
  });
}

// 4. Additional Admin Users for testing
users.push({
  id: 'admin-user-2',
  name: 'Admin User 2',
  email: 'admin2@interdomestik.com',
  password: 'AdminPassword123!',
  role: 'admin',
});
// Add original claims for legacy user
for (const c of baseClaims) {
  claims.push({
    id: c.originalId,
    userId: 'test-user',
    title: c.title,
    description: c.description,
    status: c.status,
    category: c.category,
    companyName: c.companyName,
    amount: c.amount,
    currency: c.currency,
    staffId: 'staff-user',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * c.createdAtOffsetDays),
  });
}

async function upsertUser({ id, name, email, role, password, agentId }) {
  const now = new Date();
  const hash = hashPassword(password);

  // Clean existing rows for deterministic state
  // Delete referencing tables first (order matters for FK constraints)
  await sql`delete from session where "userId" = ${id};`;
  await sql`delete from subscriptions where "user_id" = ${id} OR agent_id = ${id};`;
  await sql`delete from audit_log where "actor_id" = ${id};`;
  await sql`delete from agent_clients where agent_id = ${id} OR member_id = ${id};`;
  await sql`delete from agent_commissions where agent_id = ${id} OR member_id = ${id};`;
  await sql`delete from user_roles where user_id = ${id};`;

  // CRM tables reference user via agent_id (FK is ON DELETE NO ACTION)
  await sql`delete from crm_activities where agent_id = ${id};`;
  await sql`delete from crm_deals where agent_id = ${id};`;
  await sql`delete from crm_leads where agent_id = ${id};`;

  await sql`delete from account where "userId" = ${id};`;

  // Claims have dependents (messages/docs/stage history) that must be removed first.
  await sql`delete from claim_messages where "claim_id" in (select id from claim where "userId" = ${id});`;
  await sql`delete from claim_documents where "claim_id" in (select id from claim where "userId" = ${id});`;
  await sql`delete from claim_stage_history where "claim_id" in (select id from claim where "userId" = ${id});`;
  await sql`delete from claim where "userId" = ${id};`;
  await sql`delete from claim where agent_id = ${id};`;
  await sql`delete from "user" where id = ${id};`;

  const tenantId = DEFAULT_TENANT_ID;
  const defaultBranchId = await getTenantDefaultBranchId(tenantId);
  const branchId = role === 'agent' ? defaultBranchId : null;

  await sql`
    insert into "user" (id, name, email, "emailVerified", image, role, "agentId", "tenant_id", "branch_id", "createdAt", "updatedAt")
    values (${id}, ${name}, ${email}, ${true}, ${null}, ${role}, ${agentId || null}, ${tenantId}, ${branchId}, ${now}, ${now})
    on conflict (email) do update set
      name = excluded.name,
      role = excluded.role,
      "agentId" = excluded."agentId",
      "tenant_id" = excluded."tenant_id",
      "branch_id" = excluded."branch_id",
      "updatedAt" = excluded."updatedAt";
  `;

  // Upsert credential provider
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${`${id}-credential`}, ${email}, ${'credential'}, ${id}, ${hash}, ${now}, ${now})
    on conflict (id) do update set
      "accountId" = excluded."accountId",
      "providerId" = excluded."providerId",
      password = excluded.password,
      "updatedAt" = excluded."updatedAt";
  `;
}

async function upsertClaim(claim) {
  const now = new Date();
  // We use upsert on ID
  await sql`
    insert into claim (id, tenant_id, "userId", agent_id, branch_id, "staffId", title, description, status, category, "companyName", amount, currency, "createdAt", "updatedAt")
    values (${claim.id}, ${DEFAULT_TENANT_ID}, ${claim.userId}, ${claim.agentId || null}, ${claim.branchId || null}, ${claim.staffId || null}, ${claim.title}, ${claim.description}, ${claim.status}, ${claim.category}, ${claim.companyName}, ${claim.amount}, ${claim.currency}, ${claim.createdAt}, ${now})
    on conflict (id) do update set
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      amount = excluded.amount,
      tenant_id = excluded.tenant_id,
      agent_id = excluded.agent_id,
      branch_id = excluded.branch_id,
      "staffId" = excluded."staffId",
      "updatedAt" = excluded."updatedAt";
  `;
}

async function upsertAgentClient({ agentId, memberId, tenantId }) {
  const now = new Date();
  const id = `ac:${tenantId}:${agentId}:${memberId}`;
  await sql`
    insert into agent_clients (id, tenant_id, agent_id, member_id, status, joined_at, created_at)
    values (${id}, ${tenantId}, ${agentId}, ${memberId}, ${'active'}, ${now}, ${now})
    on conflict (tenant_id, agent_id, member_id) do update set
      status = excluded.status,
      joined_at = excluded.joined_at;
  `;
}

async function upsertTenant(params) {
  const now = new Date();
  const { id, name, legalName, countryCode, currency = 'EUR' } = params;

  await sql`
    insert into tenants (id, name, legal_name, country_code, currency, is_active, created_at, updated_at)
    values (${id}, ${name}, ${legalName}, ${countryCode}, ${currency}, ${true}, ${now}, ${now})
    on conflict (id) do update set
      name = excluded.name,
      legal_name = excluded.legal_name,
      country_code = excluded.country_code,
      currency = excluded.currency,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at;
  `;
}

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Clear sessions for deterministic logins
  await sql`delete from session;`;

  // Ensure default tenant exists for tenant_id defaults/FKs.
  await upsertTenant({
    id: DEFAULT_TENANT_ID,
    name: 'Interdomestik (E2E)',
    legalName: 'Interdomestik (E2E)',
    countryCode: 'MK',
    currency: 'EUR',
  });

  // 2. Clear old test claims (dependents first)
  const claimIds = claims.map(c => c.id);
  if (claimIds.length > 0) {
    const ids = sql(claimIds);
    await sql`delete from claim_messages where "claim_id" in ${ids};`;
    await sql`delete from claim_documents where "claim_id" in ${ids};`;
    await sql`delete from claim_stage_history where "claim_id" in ${ids};`;
    await sql`delete from claim where id in ${ids};`;
  }

  // Clear audit reference for these users (optional but cleaner)
  const userIds = users.map(u => u.id);
  if (userIds.length > 0) {
    const uIds = sql(userIds);
    await sql`delete from audit_log where "actor_id" in ${uIds};`;
  }

  // 3. Upsert Users
  const tenantId = DEFAULT_TENANT_ID;
  const defaultBranchId = await getTenantDefaultBranchId(tenantId);
  for (const user of users) {
    await upsertUser(user);
    console.log(`👤 Seeded user: ${user.email}`);
  }

  // 3.1 Upsert canonical agent ownership (agent_clients)
  for (const user of users) {
    if (user.role === 'user' && user.agentId) {
      await upsertAgentClient({ agentId: user.agentId, memberId: user.id, tenantId });
    }
  }

  // 4. Upsert Subscriptions for Test Users (to pass Membership Gate)
  for (const u of users) {
    const subscriptionId = `sub-${u.id}`;
    const agentId = u.role === 'user' ? (u.agentId ?? null) : null;
    const branchId = agentId ? defaultBranchId : defaultBranchId;

    await sql`
      insert into subscriptions (id, tenant_id, user_id, status, plan_id, current_period_end, agent_id, branch_id)
      values (
        ${subscriptionId},
        ${tenantId},
        ${u.id},
        ${'active'},
        ${'standard'},
        ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)},
        ${agentId},
        ${branchId}
      )
      on conflict (id) do update set
        tenant_id = excluded.tenant_id,
        user_id = excluded.user_id,
        status = excluded.status,
        plan_id = excluded.plan_id,
        current_period_end = excluded.current_period_end,
        agent_id = excluded.agent_id,
        branch_id = excluded.branch_id;
    `;
  }

  // 5. Upsert Claims
  for (const claim of claims) {
    const agentId = users.find(u => u.id === claim.userId)?.agentId ?? null;
    await upsertClaim({
      ...claim,
      agentId,
      branchId: defaultBranchId,
    });
    console.log(`📄 Seeded claim: ${claim.title} (${claim.status})`);
  }

  await sql.end({ timeout: 5 });
  console.log('✅ Seeding complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
