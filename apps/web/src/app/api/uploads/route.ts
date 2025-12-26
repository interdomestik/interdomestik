import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import { createSignedUploadCore, DEFAULT_BUCKET, uploadRequestSchema } from './_core';

export async function POST(req: Request) {
  const limited = await enforceRateLimit({
    name: 'api/uploads',
    limit: 10,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: req.headers });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = uploadRequestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // NOTE: Consider adding virus scanning / quarantine promotion before enabling uploads in production.
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || DEFAULT_BUCKET;

  const result = await createSignedUploadCore({
    session,
    input: parsed.data,
    bucket,
  });

  if (!result.ok) {
    if (result.status === 500) {
      console.error('Failed to create signed upload URL');
    }

    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.body, { status: result.status });
}
