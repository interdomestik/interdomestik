import * as dotenv from 'dotenv';
import { resolve } from 'node:path';

// Force load .env from project root before any DB imports
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

// Inline formatting to avoid circular dependency
function formatClaimNumber(parts: { year: number; countryCode: string; sequence: number }): string {
  const { countryCode, year, sequence } = parts;
  const seqPadded = sequence.toString().padStart(6, '0');
  return `CLM-${countryCode}-${year}-${seqPadded}`.toUpperCase();
}

async function backfillClaims() {
  console.log('🚀 Starting claim number backfill...');

  // Dynamic imports to ensure env vars are loaded first
  const { db } = await import('../db');
  const { claimCounters, claims, tenants } = await import('../schema');

  // Need to import drizzle helpers dynamically or from a safe source if not using schema
  const { asc, eq, isNull, sql } = await import('drizzle-orm');

  // 1. Get all tenants serially
  const tenantList = await db.query.tenants.findMany({
    columns: { id: true, code: true, countryCode: true },
  });

  console.log(`Found ${tenantList.length} tenants.`);

  for (const tenant of tenantList) {
    let code = tenant.code;

    // Auto-patch missing codes for dev environment
    if (!code) {
      if (tenant.id === 'tenant_mk') code = 'MK01';
      else if (tenant.id === 'tenant_ks') code = 'KS01';
      else code = tenant.id.slice(0, 4).toUpperCase(); // Fallback

      console.log(`🛠️ Patching tenant ${tenant.id} with code ${code}...`);
      await db.update(tenants).set({ code }).where(eq(tenants.id, tenant.id));
    }

    console.log(`\nProcessing tenant: ${code} (${tenant.id})...`);

    // REPAIR STEP: Detect old format (5 parts) or NULLs and fix them
    // Old: CLM-XK-KS01-2026-000001 (5 parts)
    // New: CLM-XK-2026-000001 (4 parts)
    console.log('🔧 Checking for old format numbers...');
    const allClaims = await db.query.claims.findMany({
      where: eq(claims.tenantId, tenant.id),
      columns: { id: true, claimNumber: true, createdAt: true },
      orderBy: (c, { asc }) => [asc(c.createdAt), asc(c.id)], // Ensure deterministic order for re-numbering check
    });

    // We basically need to re-format ALL claims to be safe and consistent
    // Or at least check if they match the new regex
    const NEW_FORMAT_REGEX = /^CLM-[A-Z]{2,3}-\d{4}-\d{6}$/;

    let repairedCount = 0;

    for (const c of allClaims) {
      if (!c.claimNumber || !NEW_FORMAT_REGEX.test(c.claimNumber)) {
        // Needs repair/generation
        // We need to find the sequence number for this claim
        // Ideally we don't re-generate sequence if it already exists, just re-format

        // Extract sequence from old number if possible
        let sequence = 0;
        const year = c.createdAt ? c.createdAt.getFullYear() : new Date().getFullYear();

        if (c.claimNumber) {
          const parts = c.claimNumber.split('-');
          // Try to extract sequence from last part
          const seqStr = parts[parts.length - 1];
          if (/^\d+$/.test(seqStr)) {
            sequence = parseInt(seqStr, 10);
          }
        }

        // If no sequence (was NULL completely), we might have a problem if we don't track it or re-generate.
        // But for backfill repair, we can assume we want to KEEP the sequence if it exists.

        // HOWEVER, if it was NULL, we need to generate it.
        // If it was OLD FORMAT, we keep sequence.

        if (sequence === 0) {
          // It was null or unparseable, treat as new generation
          await db.transaction(async tx => {
            const counterRes = await tx
              .insert(claimCounters)
              .values({
                tenantId: tenant.id,
                year,
                lastNumber: 1,
              })
              .onConflictDoUpdate({
                target: [claimCounters.tenantId, claimCounters.year],
                set: {
                  lastNumber: sql`${claimCounters.lastNumber} + 1`,
                  updatedAt: new Date(),
                },
              })
              .returning({
                lastNumber: claimCounters.lastNumber,
              });
            sequence = counterRes[0].lastNumber;
          });
        }

        const newNumber = formatClaimNumber({
          year,
          countryCode: tenant.countryCode,
          sequence,
        });

        if (c.claimNumber !== newNumber) {
          await db.update(claims).set({ claimNumber: newNumber }).where(eq(claims.id, c.id));
          repairedCount++;
          process.stdout.write('R');
        }
      }
    }

    if (repairedCount > 0) {
      console.log(`\n✅ Repaired/Backfilled ${repairedCount} claims for ${tenant.id}`);
    } else {
      console.log('No repairs needed.');
    }
  }

  console.log('\n✅ Backfill complete.');
}

backfillClaims()
  .catch(e => {
    console.error('❌ Backfill failed:', e);
    process.exit(1);
  })
  .then(() => process.exit(0));
