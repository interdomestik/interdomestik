import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function checkSeeds() {
  const claims = await sql`
    SELECT id, title, tenant_id FROM claim WHERE id LIKE 'ops-enriched-%' LIMIT 10;
  `;

  console.log('--- ENRICHED CLAIMS IN DB ---');
  for (const c of claims) {
    const [msgCount] =
      await sql`SELECT count(*)::int as count FROM claim_messages WHERE claim_id = ${c.id}`;
    const [docCount] =
      await sql`SELECT count(*)::int as count FROM claim_documents WHERE claim_id = ${c.id}`;
    const [histCount] =
      await sql`SELECT count(*)::int as count FROM claim_stage_history WHERE claim_id = ${c.id}`;
    console.log(
      `ID: ${c.id} | Messages: ${msgCount.count} | Docs: ${docCount.count} | History: ${histCount.count}`
    );
  }

  await sql.end();
}

checkSeeds();
