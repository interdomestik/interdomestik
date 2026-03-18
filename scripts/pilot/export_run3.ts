import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';

const { db } = await import('@interdomestik/database');
const { claims } = await import('@interdomestik/database/schema/claims');
const { desc } = await import('drizzle-orm');

async function main() {
  console.log('[Exporter] Fetching Run 3 Claims...');

  const allClaims = await db.query.claims.findMany({
    orderBy: [desc(claims.createdAt)],
    with: {
      user: true,
    },
  });

  // Filter for Run 3
  const run3Claims = allClaims.filter(c => c.title?.includes('Run 3'));

  console.log(`[Exporter] Found ${run3Claims.length} Claims for Run 3`);

  let csvContent = 'id,member_email,category,status,created_at\n';

  for (const c of run3Claims) {
    csvContent += `${c.id},${c.user.email},${c.category},${c.status},${c.createdAt?.toISOString()}\n`;
  }

  const outPath = path.join(
    process.cwd(),
    'docs/pilot/live-data/pilot-ks-live-2026-03-18_day-1_run3-claim-rollup.csv'
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csvContent);

  console.log(`🎉 Exported to ${outPath}`);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
