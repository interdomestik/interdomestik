import { claimCounters, eq, sql, tenants } from '@interdomestik/database';

interface ClaimNumberParts {
  year: number;
  countryCode: string;
  sequence: number;
}

const CLAIM_NUMBER_REGEX = /^CLM-[A-Z]{2,3}-\d{4}-\d{6}$/;

/**
 * Validates format of a claim number string.
 * Format: CLM-{CC}-{YYYY}-{NNNNNN}
 */
export function isValidClaimNumber(claimNumber: string): boolean {
  if (!claimNumber) return false;
  return CLAIM_NUMBER_REGEX.test(claimNumber.toUpperCase());
}

/**
 * Parses a valid claim number into parts. Returns null if invalid.
 */
export function parseClaimNumber(claimNumber: string): ClaimNumberParts | null {
  if (!isValidClaimNumber(claimNumber)) return null;
  const parts = claimNumber.toUpperCase().split('-');
  return {
    year: parseInt(parts[2], 10),
    countryCode: parts[1],
    sequence: parseInt(parts[3], 10),
  };
}

/**
 * Formats a claim number from parts.
 * Always returns uppercase.
 */
export function formatClaimNumber(parts: ClaimNumberParts): string {
  const { countryCode, year, sequence } = parts;
  const seqPadded = sequence.toString().padStart(6, '0');
  return `CLM-${countryCode}-${year}-${seqPadded}`.toUpperCase();
}

/**
 * Generates the next sequential claim number for a tenant.
 * Uses atomic upsert on claim_counters to ensure concurrency safety.
 * Returns the fully formatted string.
 */
export async function generateClaimNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  tenantId: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  // 1. Fetch tenant details for codes
  // We fetch within the function to ensure data integrity, though caching could be considered later.
  const tenant = await tx.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      code: true,
      countryCode: true,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant not found for ID: ${tenantId}`);
  }

  // Ensure countryCode is present
  if (!tenant.countryCode) {
    throw new Error(`Tenant ${tenantId} missing required 'countryCode' for claim generation`);
  }

  // 2. Atomic increment
  // INSERT ... ON CONFLICT DO UPDATE ... RETURNING
  const result = await tx
    .insert(claimCounters)
    .values({
      tenantId,
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

  const nextSeq = result[0].lastNumber;

  // 3. Format
  return formatClaimNumber({
    year,
    countryCode: tenant.countryCode, // Use country code directly
    sequence: nextSeq,
  });
}
