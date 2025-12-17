import fs from 'fs';
import path from 'path';
import postgres from 'postgres';

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
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (e) {}
}

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  console.log('🗑️ Force dropping tables...');

  await sql`DROP TABLE IF EXISTS "claim_messages" CASCADE`;
  await sql`DROP TABLE IF EXISTS "claim_documents" CASCADE`;
  await sql`DROP TABLE IF EXISTS "claim_timeline" CASCADE`;
  await sql`DROP TABLE IF EXISTS "claims" CASCADE`;
  await sql`DROP TABLE IF EXISTS "claim" CASCADE`;
  await sql`DROP TABLE IF EXISTS "subscriptions" CASCADE`;
  // Do NOT drop "user", "account", "session" (Better Auth)
  await sql`DROP TABLE IF EXISTS "users" CASCADE`;

  console.log('✅ Tables dropped.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
