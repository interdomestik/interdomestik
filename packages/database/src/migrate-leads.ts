import { config } from 'dotenv';
import postgres from 'postgres';

// Load environment variables from current directory
config({ path: '.env' });

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not defined');
    process.exit(1);
  }

  // Same port fix as before
  const dbUrl = process.env.DATABASE_URL.replace('localhost', '127.0.0.1');

  console.log('🔌 Connecting to database...');
  const sql = postgres(dbUrl);

  try {
    console.log('✅ Connected.');

    console.log('🛠️ Adding columns to crm_activities...');

    await sql`
      ALTER TABLE crm_activities 
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS occurred_at timestamp default now();
    `;

    console.log('✅ Migration successful: columns added to crm_activities.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
