import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

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

async function upsertBranch(params) {
  const now = new Date();
  const { id, tenantId, name, code, slug, isActive = true } = params;

  await sql`
      insert into branches (id, tenant_id, name, code, slug, is_active, created_at, updated_at)
      values (${id}, ${tenantId}, ${name}, ${code}, ${slug}, ${isActive}, ${now}, ${now})
      on conflict (id) do update set
        name = excluded.name,
        code = excluded.code,
        slug = excluded.slug,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at;
    `;
}

async function upsertDefaultBranchSetting(params) {
  const now = new Date();
  const { tenantId, branchId } = params;
  const id = `ts:${tenantId}:rbac:default_branch_id`;

  await sql`
    insert into tenant_settings (id, tenant_id, category, key, value, created_at, updated_at)
    values (${id}, ${tenantId}, ${'rbac'}, ${'default_branch_id'}, jsonb_build_object('branchId', ${branchId}), ${now}, ${now})
    on conflict (tenant_id, category, key) do update set
      value = excluded.value,
      updated_at = excluded.updated_at;
  `;
}

// Hash helper
import { randomBytes, scryptSync } from 'crypto';

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

async function upsertUser(params) {
  const now = new Date();
  const { id, name, email, role, password, tenantId } = params;
  const hash = hashPassword(password);

  // Clean existing session for deterministic login
  await sql`delete from session where "userId" = ${id};`;
  await sql`delete from account where "userId" = ${id};`;
  await sql`delete from "user" where id = ${id};`;
  // Assuming user_roles/audit might refer, but for manual seed we force simplistic overwrite

  // Create user
  await sql`
    insert into "user" (id, name, email, "emailVerified", image, role, "tenant_id", "createdAt", "updatedAt")
    values (${id}, ${name}, ${email}, ${true}, ${null}, ${role}, ${tenantId}, ${now}, ${now})
    on conflict (email) do update set
      name = excluded.name,
      role = excluded.role,
      "tenant_id" = excluded."tenant_id",
      "updatedAt" = excluded."updatedAt";
  `;

  // Create credential
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${`${id}-credential`}, ${email}, ${'credential'}, ${id}, ${hash}, ${now}, ${now})
    on conflict (id) do update set
      password = excluded.password,
      "updatedAt" = excluded."updatedAt";
  `;
}

async function main() {
  console.log('🌱 Seeding manual test branches...');

  // 1. Upsert Tenants
  console.log('🏢 Seeding tenants...');
  await upsertTenant({
    id: 'tenant_mk',
    name: 'Interdomestik MK',
    legalName: 'Interdomestik Macedonia DOOEL',
    countryCode: 'MK',
    currency: 'EUR',
  });

  await upsertTenant({
    id: 'tenant_ks',
    name: 'Interdomestik KS',
    legalName: 'Interdomestik Kosova SH.P.K.',
    countryCode: 'XK', // XK is mostly used for Kosovo
    currency: 'EUR',
  });

  // 1.1 Upsert KS Admin
  console.log('👤 Seeding KS Admin...');
  await upsertUser({
    id: 'admin-ks',
    name: 'Admin Kosova',
    email: 'admin-ks@interdomestik.com',
    password: 'AdminPassword123!',
    role: 'admin', // tenant admin effectively
    tenantId: 'tenant_ks',
  });

  // 2. Upsert Branches
  console.log('🌿 Seeding branches...');

  // MK Branches
  await upsertBranch({
    id: 'branch-mk-skopje-center',
    tenantId: 'tenant_mk',
    name: 'Skopje Center',
    code: 'MK-SK-001',
    slug: 'skopje-center',
    isActive: true,
  });

  // Set MK default branch (first active branch)
  await upsertDefaultBranchSetting({
    tenantId: 'tenant_mk',
    branchId: 'branch-mk-skopje-center',
  });

  await upsertBranch({
    id: 'branch-mk-bitola-main',
    tenantId: 'tenant_mk',
    name: 'Bitola Main',
    code: 'MK-BT-001',
    slug: 'bitola-main',
    isActive: true,
  });

  await upsertBranch({
    id: 'branch-mk-ohrid-lake',
    tenantId: 'tenant_mk',
    name: 'Ohrid Lake',
    code: 'MK-OH-001',
    slug: 'ohrid-lake',
    isActive: false, // Inactive one for testing toggle
  });

  // KS Branches
  await upsertBranch({
    id: 'branch-ks-prishtina-main',
    tenantId: 'tenant_ks',
    name: 'Prishtina Main',
    code: 'KS-PR-001',
    slug: 'prishtina-main',
    isActive: true,
  });

  // Set KS default branch (first active branch)
  await upsertDefaultBranchSetting({
    tenantId: 'tenant_ks',
    branchId: 'branch-ks-prishtina-main',
  });

  await upsertBranch({
    id: 'branch-ks-prizren-old',
    tenantId: 'tenant_ks',
    name: 'Prizren Old Town',
    code: 'KS-PZ-001',
    slug: 'prizren-old',
    isActive: true,
  });

  await sql.end({ timeout: 5 });
  console.log('✅ Seeding complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
