require('dotenv').config();
const postgres = require('postgres');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log('🔒 Applying Hardening...');

    // 1. Enable RLS
    const tables = ['user', 'session', 'account', 'verification', 'subscriptions'];
    for (const table of tables) {
      console.log(`   Enabling RLS on "${table}"...`);
      await sql`ALTER TABLE ${sql(table)} ENABLE ROW LEVEL SECURITY`;

      // 2. Add Deny Policy
      // We use safe creation 'IF NOT EXISTS' logic by checking first or using DO block,
      // but simplistic 'CREATE POLICY IF NOT EXISTS' is only in Postgres 16? No, usually separate.
      // We'll drop if exists then create.
      console.log(`   Adding 'No public access' policy to "${table}"...`);
      try {
        await sql`DROP POLICY IF EXISTS "No public access" ON ${sql(table)}`;
        await sql`CREATE POLICY "No public access" ON ${sql(table)} FOR ALL USING (false)`;
      } catch (e) {
        console.error(`Failed to set policy on ${table}:`, e.message);
      }
    }

    console.log('✅ Hardening Applied.');
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
