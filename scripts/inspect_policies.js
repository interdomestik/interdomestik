require('dotenv').config();
const postgres = require('postgres');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL);

  try {
    const policies = await sql`
      SELECT schemaname, tablename, policyname, cmd, roles 
      FROM pg_policies 
      WHERE tablename IN ('user', 'session', 'account', 'verification', 'subscriptions')
    `;
    console.log('Current Policies:');
    console.table(policies);

    const rls = await sql`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE tablename IN ('user', 'session', 'account', 'verification', 'subscriptions')
    `;
    console.log('\nRLS Status:');
    console.table(rls);
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
