import { withTenantContext } from '@interdomestik/database';
import { resolveNpsSurveyTokenTenant } from '@interdomestik/database/public-token-tenant';
import { npsSurveyResponses, npsSurveyTokens } from '@interdomestik/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type SubmitNpsResult =
  | { status: 200; body: { success: true; alreadySubmitted?: true } }
  | { status: 404; body: { error: 'Invalid token' } }
  | { status: 410; body: { error: 'Token expired' } }
  | { status: 500; body: { error: 'Failed to submit' } };

export async function submitNpsCore(args: {
  token: string;
  score: number;
  comment?: string;
  now: Date;
  userAgent: string | null;
}): Promise<SubmitNpsResult> {
  const { token, score, comment, now, userAgent } = args;

  // The fixed privileged lookup yields only the token's tenant; every validity check, the
  // one-use consumption and the response write run together inside that tenant.
  const resolved = await resolveNpsSurveyTokenTenant(token);
  if (!resolved) {
    return { status: 404, body: { error: 'Invalid token' } };
  }
  const { tenantId } = resolved;

  try {
    return await withTenantContext({ tenantId }, async (tx): Promise<SubmitNpsResult> => {
      const [tokenRow] = await tx
        .select({
          id: npsSurveyTokens.id,
          userId: npsSurveyTokens.userId,
          subscriptionId: npsSurveyTokens.subscriptionId,
          expiresAt: npsSurveyTokens.expiresAt,
          usedAt: npsSurveyTokens.usedAt,
        })
        .from(npsSurveyTokens)
        .where(and(eq(npsSurveyTokens.token, token), eq(npsSurveyTokens.tenantId, tenantId)))
        .limit(1);

      if (!tokenRow) {
        return { status: 404, body: { error: 'Invalid token' } };
      }

      if (tokenRow.expiresAt && tokenRow.expiresAt < now) {
        return { status: 410, body: { error: 'Token expired' } };
      }

      if (tokenRow.usedAt) {
        return { status: 200, body: { success: true, alreadySubmitted: true } };
      }

      const updatedRows = await tx
        .update(npsSurveyTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(npsSurveyTokens.id, tokenRow.id),
            eq(npsSurveyTokens.tenantId, tenantId),
            isNull(npsSurveyTokens.usedAt)
          )
        )
        .returning({ id: npsSurveyTokens.id });

      if (updatedRows.length === 0) {
        return { status: 200, body: { success: true, alreadySubmitted: true } };
      }

      await tx.insert(npsSurveyResponses).values({
        id: nanoid(),
        tenantId,
        tokenId: tokenRow.id,
        userId: tokenRow.userId,
        subscriptionId: tokenRow.subscriptionId,
        score,
        comment: comment || null,
        createdAt: now,
        metadata: {
          userAgent,
        },
      });

      return { status: 200, body: { success: true } };
    });
  } catch (error) {
    console.error('Failed to submit NPS:', error);
    return { status: 500, body: { error: 'Failed to submit' } };
  }
}

export type NpsTokenStatusResult =
  | { status: 200; body: { valid: true; alreadySubmitted: boolean } }
  | { status: 400; body: { error: 'Missing token' } }
  | { status: 404; body: { error: 'Invalid token' } }
  | { status: 410; body: { error: 'Token expired' } };

export async function getNpsTokenStatusCore(args: {
  token: string;
  now: Date;
}): Promise<NpsTokenStatusResult> {
  const { token, now } = args;

  if (!token) {
    return { status: 400, body: { error: 'Missing token' } };
  }

  const resolved = await resolveNpsSurveyTokenTenant(token);
  if (!resolved) {
    return { status: 404, body: { error: 'Invalid token' } };
  }
  const { tenantId } = resolved;

  const [row] = await withTenantContext({ tenantId }, tx =>
    tx
      .select({
        expiresAt: npsSurveyTokens.expiresAt,
        usedAt: npsSurveyTokens.usedAt,
      })
      .from(npsSurveyTokens)
      .where(and(eq(npsSurveyTokens.token, token), eq(npsSurveyTokens.tenantId, tenantId)))
      .limit(1)
  );

  if (!row) {
    return { status: 404, body: { error: 'Invalid token' } };
  }

  if (row.expiresAt && row.expiresAt < now) {
    return { status: 410, body: { error: 'Token expired' } };
  }

  return {
    status: 200,
    body: {
      valid: true,
      alreadySubmitted: !!row.usedAt,
    },
  };
}
