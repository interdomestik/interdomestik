require('dotenv').config();
const postgres = require('postgres');

async function main() {
  const sql = postgres(process.env.DATABASE_URL);
  // Check storage.buckets and storage.objects policies
  // storage schema is typically hidden or protected, but pg_policies shows all
  const policies = await sql`
     SELECT * FROM pg_policies WHERE schemaname = 'storage' OR tablename = 'objects'
  `;
  console.log('Storage Policies:', policies);

  const buckets = await sql`SELECT id, public FROM storage.buckets`;
  console.log('Buckets:', buckets);

  await sql.end();
}
main();
