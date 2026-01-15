import { and, asc, claims, db, eq, isNull, tenants } from '@interdomestik/database';
import { generateClaimNumber } from '@interdomestik/database/claim-number';
import 'dotenv/config';
import { parseArgs } from 'node:util';

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      tenant: { type: 'string' },
      limit: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });

  const targetTenantId = values.tenant;
  const limit = values.limit ? parseInt(values.limit, 10) : undefined;
  const isDryRun = values['dry-run'] ?? false;

  console.log('--- Backfill Claims Traceability ---');
  if (isDryRun) console.log('MODE: DRY-RUN (No changes will be committed)');
  if (targetTenantId) console.log(`TARGET: Tenant ${targetTenantId}`);
  if (limit) console.log(`LIMIT: ${limit} claims per tenant`);

  // 1. Fetch Tenants
  const tenantList = await db
    .select({ id: tenants.id, code: tenants.code })
    .from(tenants)
    .where(targetTenantId ? eq(tenants.id, targetTenantId) : undefined);

  if (!tenantList.length) {
    console.error('No tenants found matching criteria.');
    process.exit(1);
  }

  console.log(`Found ${tenantList.length} tenants to process.`);

  let totalProcessed = 0;
  let totalErrors = 0;

  // 2. Process per Tenant
  for (const tenant of tenantList) {
    console.log(`\nProcessing Tenant: ${tenant.code} (${tenant.id})...`);

    // Fetch un-numbered claims
    // Deterministic Order: createdAt ASC, id ASC
    const unnumberedClaims = await db
      .select({ id: claims.id, createdAt: claims.createdAt })
      .from(claims)
      .where(and(eq(claims.tenantId, tenant.id), isNull(claims.claimNumber)))
      .orderBy(asc(claims.createdAt), asc(claims.id))
      .limit(limit || 10000); // Safety cap if no limit provided

    if (!unnumberedClaims.length) {
      console.log('  No un-numbered claims found.');
      continue;
    }

    console.log(`  Found ${unnumberedClaims.length} claims to backfill.`);

    for (const claim of unnumberedClaims) {
      process.stdout.write(
        `  - Claim ${claim.id.slice(0, 8)} (${claim.createdAt.toISOString()}): `
      );

      if (isDryRun) {
        console.log('WOULD GENERATE');
        continue;
      }

      try {
        await db.transaction(async tx => {
          // Verify still null (double-check race) is handled by generateClaimNumber internally IF we used the update pattern.
          // But generateClaimNumber expects us to call it.
          // It performs: select -> check -> guards -> update(where null).

          const claimNumber = await generateClaimNumber(tx, {
            tenantId: tenant.id,
            claimId: claim.id,
            createdAt: claim.createdAt, // MUST use row's createdAt
          });
          process.stdout.write(`SUCCESS -> ${claimNumber}\n`);
          totalProcessed++;
        });
      } catch (err: any) {
        process.stdout.write(`FAILED -> ${err.message}\n`);
        totalErrors++;
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Processed: ${totalProcessed}`);
  console.log(`Errors:    ${totalErrors}`);
  console.log(totalErrors > 0 ? 'WARNING: Some claims failed.' : 'SUCCESS: Backfill complete.');

  // Explicit exit needed for some DB drivers
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal Script Error:', err);
  process.exit(1);
});
