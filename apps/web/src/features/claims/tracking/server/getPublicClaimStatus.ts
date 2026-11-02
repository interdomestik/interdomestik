import { withTenantContext } from '@interdomestik/database';
import { resolveClaimTrackingTokenTenant } from '@interdomestik/database';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
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

      // 1. Resolve the token's tenant (fixed privileged lookup; internal only)
      const now = new Date();
      const resolved = await resolveClaimTrackingTokenTenant(token, now);
      if (!resolved) {
        return null;
      }

      // 2. Revalidate the token and read the minimal claim status inside that tenant
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const { tenantId, claimId } = resolved;
      const claim = await withTenantContext({ tenantId }, async tx => {
        const [validToken] = await tx
          .select({ id: claimTrackingTokens.id })
          .from(claimTrackingTokens)
          .where(
            and(
              eq(claimTrackingTokens.tenantId, tenantId),
              eq(claimTrackingTokens.claimId, claimId),
              eq(claimTrackingTokens.tokenHash, tokenHash),
              gt(claimTrackingTokens.expiresAt, now),
              isNull(claimTrackingTokens.revokedAt)
            )
          )
          .limit(1);
        if (!validToken) return undefined;

        return tx.query.claims.findFirst({
          where: and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)),
          columns: {
            id: true,
            caseLifecycleState: true,
            recoveryLifecycleState: true,
            updatedAt: true,
          },
        });
      });

      if (!claim) return null;

      const { status } = resolveClaimLifecycleReadProjection(claim);

      // 3. Return DTO (No PII)
      return {
        claimId: claim.id,
        status,
        statusLabelKey: `claims-tracking.status.${status}`,
        lastUpdatedAt: claim.updatedAt ?? new Date(),
        nextStepKey: `claims-tracking.status.next_step.${status}`,
      };
    }
  );
}
