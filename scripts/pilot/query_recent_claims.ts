import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { db } = await import('@interdomestik/database');
  const { claims } = await import('@interdomestik/database/schema/claims');
  const { desc } = await import('drizzle-orm');

  console.log('[Query] Connecting to Database...');
  const allClaims = await db.query.claims.findMany({
    orderBy: [desc(claims.createdAt)],
    limit: 10,
  });

  console.log('\n--- Recent 10 Claims ---');
  for (const c of allClaims) {
    console.log(`- Title: ${c.title}`);
    console.log(`  ID:    ${c.id}`);
    console.log(`  Date:  ${c.createdAt?.toISOString()}`);
    console.log('---');
  }
}

main().catch(console.error);
