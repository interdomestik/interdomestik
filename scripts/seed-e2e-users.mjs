import { Argon2id } from 'oslo/password';
import postgres from 'postgres';

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required to seed E2E users');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

const userIds = ['test-user', 'admin-user'];

const users = [
  {
    id: 'test-user',
    name: 'Test User',
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
];

async function upsertUser({ id, name, email, role, password }) {
  const now = new Date();
  const hash = await new Argon2id().hash(password);

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

  // Upsert credential provider (used by fixtures)
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${`${id}-credential`}, ${id}, ${'credential'}, ${id}, ${hash}, ${now}, ${now})
    on conflict (id) do update set
      "accountId" = excluded."accountId",
      "providerId" = excluded."providerId",
      password = excluded.password,
      "updatedAt" = excluded."updatedAt";
  `;

  // Upsert email provider (used by /api/auth/sign-in/email)
  await sql`
    insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${`${id}-email`}, ${email}, ${'email'}, ${id}, ${hash}, ${now}, ${now})
    on conflict (id) do update set
      "accountId" = excluded."accountId",
      "providerId" = excluded."providerId",
      password = excluded.password,
      "updatedAt" = excluded."updatedAt";
  `;
}

async function main() {
  // Clear sessions for deterministic logins
  await sql`delete from session where "userId" in ${sql(userIds)};`;

  for (const user of users) {
    await upsertUser(user);
    console.log(`Seeded ${user.email}`);
  }
  await sql.end({ timeout: 5 });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
