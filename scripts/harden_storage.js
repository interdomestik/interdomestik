require('dotenv').config();
const postgres = require('postgres');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL);

  try {
    console.log('🔒 Hardening Storage...');

    // List of policies to DROP (Legacy/Insecure/Unused)
    const policiesToDrop = [
      'Members can insert own evidence objects',
      'Members can read own evidence objects',
      'Members can delete own evidence objects',
      'Members can insert own voice note objects',
      'Members can read own voice note objects',
      'Members can delete own voice note objects',
      'Members can insert own policy objects',
      'Members can read own policy objects',
      'Members can delete own policy objects',
    ];

    for (const policyName of policiesToDrop) {
      console.log(`   Dropping policy "${policyName}" on storage.objects...`);
      try {
        await sql`DROP POLICY IF EXISTS ${sql(policyName)} ON storage.objects`;
      } catch (e) {
        console.error(`   Failed to drop "${policyName}":`, e.message);
      }
    }

    // Ensure "Service role full access" exists (should exist already, but good to verify?)
    // We won't recreate it to avoid conflict, relying on inspect to verify it remains.

    console.log('✅ Storage Hardened (Legacy/Public policies removed).');
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
