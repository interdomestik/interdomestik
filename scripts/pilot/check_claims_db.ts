import { db, claims, eq, desc, user } from '@interdomestik/database';

async function main() {
  console.log('[Script] Connecting to Database...');

  // Fetch top 100 claims
  const allClaims = await db.query.claims.findMany({
    orderBy: [desc(claims.createdAt)],
    limit: 100,
  });

  console.log(`[Script] Total Claims Found (Recent 100): ${allClaims.length}`);

  // Filter by title containing "Live Pilot"
  const filtered = allClaims.filter(c => c.title?.toLowerCase().includes('live pilot'));

  console.log(`[Script] Found ${filtered.length} "Live Pilot" Claims.`);

  for (const c of filtered) {
    const member = await db.query.user.findFirst({
      where: eq(user.id, c.userId),
    });

    console.log(`\n--- Claim: ${c.id} ---`);
    console.log(`Title: ${c.title}`);
    console.log(`Member: ${member?.email || 'Unknown'} (ID: ${c.userId})`);
    console.log(`Category: ${c.category}`);
    console.log(`Created: ${c.createdAt?.toISOString()}`);
    console.log(`Status: ${c.status}`);
  }
}

try {
  await main();
} catch (err) {
  console.error('[Script] Error:', err);
  process.exit(1);
}
