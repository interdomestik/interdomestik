import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getNpsTokenStatusCore, submitNpsCore } from './_core';

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

  const result = await submitNpsCore({
    token,
    score,
    comment,
    now: new Date(),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json(result.body, { status: result.status });
}

// Optional: allow clients to check if a token is still valid / already used
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';

  const result = await getNpsTokenStatusCore({ token, now: new Date() });
  return NextResponse.json(result.body, { status: result.status });
}
