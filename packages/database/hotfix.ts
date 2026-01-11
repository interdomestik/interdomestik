import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
  }

  const sql = postgres(connectionString);
  console.log('Attempting to apply hotfix schemas...');

  try {
    await sql`ALTER TABLE "claim" ADD COLUMN IF NOT EXISTS "staffId" text REFERENCES "user"("id");`;
    console.log('✅ Added column: staffId');
  } catch (e: any) {
    console.log('⚠️ staffId error:', e.message);
  }

  try {
    await sql`ALTER TABLE "claim" ADD COLUMN IF NOT EXISTS "assignedAt" timestamp;`;
    console.log('✅ Added column: assignedAt');
  } catch (e: any) {
    console.log('⚠️ assignedAt error:', e.message);
  }

  await sql.end();
  console.log('Hotfix complete.');
}

main();
