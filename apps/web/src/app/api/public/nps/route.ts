import { db } from '@interdomestik/database';
import { npsSurveyResponses, npsSurveyTokens } from '@interdomestik/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SubmitNpsSchema = z.object({
  token: z.string().min(10),
  score: z.number().int().min(0).max(10),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = SubmitNpsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { token, score, comment } = parsed.data;
  const now = new Date();

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
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  if (tokenRow.expiresAt && tokenRow.expiresAt < now) {
    return NextResponse.json({ error: 'Token expired' }, { status: 410 });
  }

  if (tokenRow.usedAt) {
    return NextResponse.json({ success: true, alreadySubmitted: true });
  }

  try {
    const updated = await db
      .update(npsSurveyTokens)
      .set({ usedAt: now })
      .where(and(eq(npsSurveyTokens.id, tokenRow.id), isNull(npsSurveyTokens.usedAt)))
      .returning({ id: npsSurveyTokens.id });

    if (updated.length === 0) {
      return NextResponse.json({ success: true, alreadySubmitted: true });
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
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to submit NPS:', error);
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 });
  }
}

// Optional: allow clients to check if a token is still valid / already used
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
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
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  const now = new Date();
  if (row.expiresAt && row.expiresAt < now) {
    return NextResponse.json({ error: 'Token expired' }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    alreadySubmitted: !!row.usedAt,
  });
}
