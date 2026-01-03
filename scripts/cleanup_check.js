require('dotenv').config();
const postgres = require('postgres');

async function main() {
  const sql = postgres(process.env.DATABASE_URL);

  const tables = ['user', 'users', 'claim', 'claims', 'subscriptions', 'subscription', 'session'];

  console.log('🔍 Checking Schema Usage...');

  for (const t of tables) {
    try {
      const count = await sql`SELECT count(*) FROM ${sql(t)}`;
      console.log(`Table "${t}": ${count[0].count} rows (Exists)`);
    } catch (e) {
      if (e.code === '42P01') {
        console.log(`Table "${t}": DOES NOT EXIST`);
      } else {
        console.log(`Table "${t}": Error ${e.message}`);
      }
    }
  }

  await sql.end();
}
main();
