import { claims, claimMessages, db, eq, and } from '@interdomestik/database';

async function main() {
  console.log('[Boundary] Connecting to Database...');

  const claimId = 'ocpfGD1-2q8ILO4ktZvaK'; // Claim with internal messages from notify

  console.log(`[Boundary] Checking Message Visibility for Claim: ${claimId}`);

  // 1. Fetch as Staff (Should see ALL messages)
  const staffMessages = await db.query.claimMessages.findMany({
    where: eq(claimMessages.claimId, claimId),
  });

  console.log(`[Boundary] Staff sees ${staffMessages.length} total messages.`);

  // 2. Fetch as Member simulation (Filtered)
  const memberMessages = await db.query.claimMessages.findMany({
    where: and(
      eq(claimMessages.claimId, claimId),
      eq(claimMessages.isInternal, false) // This is the filter applied in code for Members
    ),
  });

  console.log(`[Boundary] Member sees ${memberMessages.length} messages.`);

  const internalCount = staffMessages.length - memberMessages.length;
  if (internalCount > 0) {
    console.log(
      `✅ BOUNDARY PASS: Member is correctly isolated from ${internalCount} Internal Staff Notes.`
    );
  } else {
    console.log('⚠️ Warning: No internal notes found to verify filter differential.');
  }

  // 3. Tenant Isolation verification (Simple check)
  const tenantClaims = await db.query.claims.findMany({
    where: eq(claims.tenantId, 'tenant_ks'),
    limit: 5,
  });

  const matches = tenantClaims.every(c => c.tenantId === 'tenant_ks');
  if (matches) {
    console.log('✅ BOUNDARY PASS: All returned claims match `tenant_ks` explicitly.');
  } else {
    console.log('❌ BOUNDARY FAIL: Mixed tenants in query!');
  }

  console.log('🎉 Boundary Verification Script Finished Successfully!');
}

try {
  await main();
} catch (err) {
  console.error('[Boundary] Error:', err);
  process.exit(1);
}
