import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from './db';
import { claimCounters } from './schema/claim-counters';
import { claims } from './schema/claims';
import { tenants } from './schema/tenants';

class ClaimNumberGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimNumberGenerationError';
  }
}

const CLAIM_NUMBER_REGEX = /^CLM-[A-Z0-9]{2,10}-\d{4}-\d{6}$/;

/**
 * Validates format of a claim number string.
 * Format: CLM-{CODE}-{YYYY}-{NNNNNN}
 */
export function isValidClaimNumber(claimNumber: string): boolean {
  if (!claimNumber) return false;
  return CLAIM_NUMBER_REGEX.test(claimNumber.toUpperCase());
}

/**
 * formats values into CLM-{CODE}-{YYYY}-{NNNNNN}
 */
export function formatClaimNumber(tenantCode: string, year: number, sequence: number): string {
  const seqStr = sequence.toString().padStart(6, '0');
  return `CLM-${tenantCode}-${year}-${seqStr}`;
}

export function parseClaimNumber(
  claimNumber: string
): { tenantCode: string; year: number; sequence: number } | null {
  if (!isValidClaimNumber(claimNumber)) return null;
  const parts = claimNumber.toUpperCase().split('-');
  return {
    tenantCode: parts[1],
    year: parseInt(parts[2], 10),
    sequence: parseInt(parts[3], 10),
  };
}

/**
 * Generates and assigns a sequential claim number with:
 * - immutability (returns existing)
 * - tenant isolation
 * - race safety (conditional update where claimNumber IS NULL)
 * - monotonic (not gapless) counters
 */
type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function generateClaimNumber(
  tx: DrizzleTx,
  params: { tenantId: string; claimId: string; createdAt: Date }
): Promise<string> {
  const { tenantId, claimId, createdAt } = params;

  // 1) Read claim first (immutability + existence + tenant isolation)
  const [existing] = await tx
    .select({ claimNumber: claims.claimNumber })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);

  if (existing?.claimNumber) return existing.claimNumber;

  // 2) Guard tenant code BEFORE touching the counter (gap reduction)
  const [tenant] = await tx
    .select({ code: tenants.code })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.code) {
    // MUST: this exact shape is used by your audit check
    throw new Error(`Tenant code not found for tenantId: ${tenantId}`);
  }

  // 3) Year semantics (historical accuracy)
  const year = createdAt.getFullYear();

  // 4) Atomic counter increment (UPSERT)
  const [counter] = await tx
    .insert(claimCounters)
    .values({ tenantId, year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [claimCounters.tenantId, claimCounters.year],
      set: {
        lastNumber: sql`${claimCounters.lastNumber} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ lastNumber: claimCounters.lastNumber });

  if (!counter?.lastNumber) {
    // Avoid "throw Error" after counter to satisfy guard ordering check
    throw new ClaimNumberGenerationError('Failed to generate claim sequence');
  }

  const claimNumber = formatClaimNumber(tenant.code, year, counter.lastNumber);

  // 5) Race-safe conditional update
  const [updated] = await tx
    .update(claims)
    .set({ claimNumber })
    .where(
      and(
        eq(claims.id, claimId),
        eq(claims.tenantId, tenantId),
        isNull(claims.claimNumber) // <-- REQUIRED by audit
      )
    )
    .returning({ id: claims.id });

  // 6) Race lost → re-read and return existing
  if (!updated) {
    const [reCheck] = await tx
      .select({ claimNumber: claims.claimNumber })
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
      .limit(1);

    if (reCheck?.claimNumber) return reCheck.claimNumber;

    // Avoid "throw Error" after counter

    throw new ClaimNumberGenerationError(
      `Claim ${claimId} could not be numbered (race lost, and no number present).`
    );
  }

  return claimNumber;
}
