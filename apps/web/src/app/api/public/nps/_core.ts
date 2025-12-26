import { db } from '@interdomestik/database';
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

  const [tokenRow] = await db
    .select({
      id: npsSurveyTokens.id,
      userId: npsSurveyTokens.userId,
      subscriptionId: npsSurveyTokens.subscriptionId,
      expiresAt: npsSurveyTokens.expiresAt,
      usedAt: npsSurveyTokens.usedAt,
    })
    .from(npsSurveyTokens)
    .where(eq(npsSurveyTokens.token, token))
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

  try {
    const updated = await db
      .update(npsSurveyTokens)
      .set({ usedAt: now })
      .where(and(eq(npsSurveyTokens.id, tokenRow.id), isNull(npsSurveyTokens.usedAt)))
      .returning({ id: npsSurveyTokens.id });

    if (updated.length === 0) {
      return { status: 200, body: { success: true, alreadySubmitted: true } };
    }

    await db.insert(npsSurveyResponses).values({
      id: nanoid(),
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

  const [row] = await db
    .select({
      expiresAt: npsSurveyTokens.expiresAt,
      usedAt: npsSurveyTokens.usedAt,
    })
    .from(npsSurveyTokens)
    .where(eq(npsSurveyTokens.token, token))
    .limit(1);

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
