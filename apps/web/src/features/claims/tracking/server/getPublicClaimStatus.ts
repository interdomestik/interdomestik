import { db } from '@interdomestik/database';
import { claims, claimTrackingTokens } from '@interdomestik/database/schema';
import * as Sentry from '@sentry/nextjs';
import crypto from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import 'server-only';
import type { PublicClaimStatusDto } from '../types';

// TODO: Replace with proper proxy-level or Redis rate limiter
const RATE_LIMIT_CACHE = new Map<string, { count: number; lastReset: number }>();

export function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const window = 60000; // 1 minute
  const limit = 20; // 20 requests per minute

  let entry = RATE_LIMIT_CACHE.get(identifier);
  if (!entry || now - entry.lastReset > window) {
    entry = { count: 0, lastReset: now };
  }

  entry.count++;
  RATE_LIMIT_CACHE.set(identifier, entry);

  return entry.count <= limit;
}

export async function getPublicClaimStatus(token: string): Promise<PublicClaimStatusDto | null> {
  return Sentry.withServerActionInstrumentation(
    'getPublicClaimStatus',
    { recordResponse: true },
    async () => {
      // 0. Rate Limit (Stub)
      // Implementation depends on how we get IP here. For now, we skip IP check in this loader
      // and assume proxy handles DDoS.

      // 1. Hash Token
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // 2. Lookup Token
      const now = new Date();

      const record = await db.query.claimTrackingTokens.findFirst({
        where: and(
          eq(claimTrackingTokens.tokenHash, tokenHash),
          gt(claimTrackingTokens.expiresAt, now),
          isNull(claimTrackingTokens.revokedAt)
        ),
      });

      if (!record) {
        return null;
      }

      // 3. Fetch Claim Status (Minimal)
      const claim = await db.query.claims.findFirst({
        where: eq(claims.id, record.claimId),
        columns: {
          id: true,
          status: true,
          updatedAt: true,
        },
      });

      if (!claim) return null;

      // 4. Return DTO (No PII)
      return {
        claimId: claim.id,
        status: (claim.status || 'draft') as any, // Cast to any or explicit type to match DTO
        statusLabelKey: `claims-tracking.status.${claim.status || 'draft'}`,
        lastUpdatedAt: claim.updatedAt ?? new Date(),
        nextStepKey: `claims-tracking.status.next_step.${claim.status}`,
      };
    }
  );
}
