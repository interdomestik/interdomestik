import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not defined');
    process.exit(1);
  }
  const sql = postgres(connectionString);

  try {
    console.log('Cleaning claims table...');
    // Delete all claims - cascading should handle related records if configured,
    // but we might need to be careful.
    // For now, simple delete.
    await sql`DELETE FROM "claim"`;
    console.log('✅ Claims deleted.');

    // Also optional: clean users created by seed?
    // But seed script attempts to UPSERT users.
    // The FK error happened when UPDATING a user that is referenced by a claim.
    // Now that claims are gone, UPSERT user should work.
  } catch (e: any) {
    console.error('Error cleaning claims:', e);
  } finally {
    await sql.end();
  }
}

main();
