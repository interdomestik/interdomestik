import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { NextResponse } from 'next/server';

import { createSignedUploadCore, uploadRequestSchema } from './_core';

export async function POST(req: Request) {
  const limited = await enforceRateLimit({
    name: 'api/uploads',
    limit: 10,
    windowSeconds: 60,
    headers: req.headers,
    productionSensitive: true,
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

  let bucket: string;
  try {
    // NOTE: Consider adding virus scanning / quarantine promotion before enabling uploads in production.
    bucket = resolveEvidenceBucketName();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[api/uploads] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

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
