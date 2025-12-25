import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@interdomestik/database';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_BUCKET = 'claim-evidence';

const requestSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().positive(),
  claimId: z.string().optional(),
});

const sanitizeFileName = (fileName: string) => fileName.replace(/[^\w.-]+/g, '_');

export async function POST(req: Request) {
  const limited = await enforceRateLimit({
    name: 'api/uploads',
    limit: 10,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { fileName, fileType, fileSize, claimId } = parsed.data;

  if (!ALLOWED_MIME_TYPES.includes(fileType)) {
    return NextResponse.json({ error: 'File type not allowed' }, { status: 415 });
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  // TODO: plug virus scan service (clamd/lambda) before issuing signed URLs for production

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || DEFAULT_BUCKET;
  const adminClient = createAdminClient();
  const evidenceId = nanoid();
  const safeName = sanitizeFileName(fileName);
  const classification = 'pii';
  const path = `${classification}/claims/${session.user.id}/${claimId ?? 'unassigned'}/${evidenceId}-${safeName}`;

  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    console.error('Failed to create signed upload URL', error);
    return NextResponse.json({ error: 'Failed to create signed upload URL' }, { status: 500 });
  }

  return NextResponse.json({
    upload: {
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      bucket,
      expiresIn: 300,
    },
    classification,
    maxFileSize: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
}
