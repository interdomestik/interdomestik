import fs from 'fs';
import { Scrypt } from 'oslo/password';
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

const users = [
  {
    id: 'test-user',
    name: 'Test Member',
    email: 'test@interdomestik.com',
    password: 'TestPassword123!',
    role: 'user',
  },
  {
    id: 'admin-user',
    name: 'Admin User',
    email: 'admin@interdomestik.com',
    password: 'AdminPassword123!',
    role: 'admin',
  },
  {
    id: 'agent-user',
    name: 'Support Agent',
    email: 'agent@interdomestik.com',
    password: 'AgentPassword123!',
    role: 'agent',
  },
];

const claims = [
  {
    id: 'claim-1',
    userId: 'test-user',
    title: 'Car Accident - Rear Ended',
    description:
      'I was rear-ended at a red light on George Bush Blvd. The other driver admitted fault.',
    status: 'submitted',
    category: 'auto',
    companyName: 'Sigal',
    amount: '1200.00',
    currency: 'EUR',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
  },
  {
    id: 'claim-2',
    userId: 'test-user',
    title: 'Flight Delay to Munich',
    description: 'My flight to Munich was delayed by 6 hours without explanation.',
    status: 'verification',
    category: 'travel',
    companyName: 'Austrian Airlines',
    amount: '600.00',
    currency: 'EUR',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5), // 5 days ago
  },
  {
    id: 'claim-3',
    userId: 'test-user',
    title: 'Defective Laptop',
    description:
      'The laptop screen started flickering one week after purchase. Vendor refuses warranty.',
    status: 'evaluation',
    category: 'retail',
    companyName: 'TechnoMarket',
    amount: '850.00',
    currency: 'EUR',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10), // 10 days ago
  },
  {
    id: 'claim-4',
    userId: 'test-user',
    title: 'Water Damage in Apartment',
    description: 'Upstairs neighbor had a leak that damaged my ceiling and hardwood floor.',
    status: 'negotiation',
    category: 'real_estate',
    companyName: 'Building Mgmt',
    amount: '2500.00',
    currency: 'EUR',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20), // 20 days ago
  },
  {
    id: 'claim-5',
    userId: 'test-user',
    title: 'Rejected Insurance Claim',
    description: 'Insurance denied coverage for storm damage citing a clause I cannot find.',
    status: 'rejected',
    category: 'insurance',
    companyName: 'Illyria',
    amount: '5000.00',
    currency: 'EUR',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), // 30 days ago
  },
];

async function upsertUser({ id, name, email, role, password }) {
  const now = new Date();
  const hash = await new Scrypt().hash(password);

  // Clean existing rows for deterministic state
  await sql`delete from account where "userId" = ${id};`;
  await sql`delete from "user" where id = ${id};`;

  await sql`
    insert into "user" (id, name, email, "emailVerified", image, role, "createdAt", "updatedAt")
    values (${id}, ${name}, ${email}, ${true}, ${null}, ${role}, ${now}, ${now})
    on conflict (email) do update set
      name = excluded.name,
      role = excluded.role,
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
    insert into claim (id, "userId", title, description, status, category, "companyName", amount, currency, "createdAt", "updatedAt")
    values (${claim.id}, ${claim.userId}, ${claim.title}, ${claim.description}, ${claim.status}, ${claim.category}, ${claim.companyName}, ${claim.amount}, ${claim.currency}, ${claim.createdAt}, ${now})
    on conflict (id) do update set
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      amount = excluded.amount,
      "updatedAt" = excluded."updatedAt";
  `;
}

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Clear sessions for deterministic logins
  await sql`delete from session;`;

  // 2. Clear old test claims (optional, but good for cleanup)
  await sql`delete from claim where id in ${sql(claims.map(c => c.id))};`;

  // 3. Upsert Users
  for (const user of users) {
    await upsertUser(user);
    console.log(`👤 Seeded user: ${user.email}`);
  }

  // 4. Upsert Claims
  for (const claim of claims) {
    await upsertClaim(claim);
    console.log(`📄 Seeded claim: ${claim.title} (${claim.status})`);
  }

  await sql.end({ timeout: 5 });
  console.log('✅ Seeding complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
