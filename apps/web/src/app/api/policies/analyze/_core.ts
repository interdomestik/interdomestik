import { analyzePolicyImages, analyzePolicyText } from '@/lib/ai/policy-analyzer';
import { auth } from '@/lib/auth'; // Using better-auth
import { enforceRateLimit } from '@/lib/rate-limit';
import { createAdminClient, db } from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES =
  Number.parseInt(process.env.POLICY_UPLOAD_MAX_BYTES || '', 10) || 15_000_000;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const POLICIES_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';
const ANALYSIS_TIMEOUT_MS =
  Number.parseInt(process.env.POLICY_ANALYSIS_TIMEOUT_MS || '', 10) || 15_000;

function isValidUpload(file: File) {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  );
}

class PolicyAnalysisTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyAnalysisTimeoutError';
  }
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new PolicyAnalysisTimeoutError(`${label} timed out`));
    }, ANALYSIS_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Derive image type from MIME, extension, or magic bytes
function isImageFile(file: File, buffer: Buffer): boolean {
  if (file.type.startsWith('image/')) return true;

  const lower = file.name.toLowerCase();
  const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  if (validExtensions.some(ext => lower.endsWith(ext))) return true;

  if (buffer.length < 4) return false;

  const magicBytes = [
    { name: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47] },
    { name: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
  ];

  for (const { bytes } of magicBytes) {
    if (bytes.every((byte, i) => buffer[i] === byte)) return true;
  }

  // WebP: RIFF [4-7] WEBP [8-11]
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }

  return false;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, '_');
}

function formatError(prefix: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') return prefix;
  const message = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${message}`;
}

type UploadPolicyResult = { ok: true; filePath: string } | { ok: false; error: string };

async function uploadPolicyFile(args: {
  userId: string;
  tenantId: string;
  file: File;
  buffer: Buffer;
  safeName: string;
}): Promise<UploadPolicyResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'Supabase service role key is required for policy uploads.' };
  }

  const filePath = `pii/tenants/${args.tenantId}/policies/${args.userId}/${Date.now()}_${
    args.safeName
  }`;
  const adminClient = createAdminClient();
  const { error } = await adminClient.storage.from(POLICIES_BUCKET).upload(filePath, args.buffer, {
    contentType: args.file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    console.error('Supabase policy upload error:', error);
    return { ok: false, error: 'Failed to upload policy file' };
  }

  return { ok: true, filePath };
}

async function getAuthorizedSession(req: NextRequest) {
  const headersList = req.headers;
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session?.user) {
    return { error: 'Unauthorized', status: 401 as const };
  }

  const limit = await enforceRateLimit({
    name: 'api:policy-analyze',
    limit: 5,
    windowSeconds: 60,
    headers: headersList,
  });

  if (limit) {
    return { limitResponse: limit };
  }

  return { session, headersList };
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await getAuthorizedSession(req);

    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if ('limitResponse' in authResult) {
      return authResult.limitResponse;
    }

    const { session } = authResult;

    const formData = await req.formData();
    const file = formData.get('file') as File;

    const validation = validatePolicyUpload(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if this is a direct image upload (not a PDF)
    const isImage = isImageFile(file, buffer);
    const tenantId = ensureTenantId(session);
    const userId = session.user.id;

    if (isImage) {
      return await handleImageAnalysis({
        file,
        buffer,
        tenantId,
        userId,
      });
    }

    return await handlePdfAnalysis({
      file,
      buffer,
      tenantId,
      userId,
    });
  } catch (error: unknown) {
    if (error instanceof PolicyAnalysisTimeoutError) {
      return NextResponse.json({ error: error.message }, { status: 504 });
    }
    console.error('Policy Analysis Error:', error);
    return NextResponse.json({ error: formatError('Server error', error) }, { status: 500 });
  }
}

function validatePolicyUpload(file: File | null): {
  valid: boolean;
  error?: string;
  status?: number;
} {
  if (!file) {
    return { valid: false, error: 'No file provided', status: 400 };
  }

  if (!isValidUpload(file)) {
    return {
      valid: false,
      error: 'Only PDF and image uploads are supported (PDF, JPEG, PNG, WebP)',
      status: 400,
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: 'File too large', status: 413 };
  }

  return { valid: true };
}

async function handleImageAnalysis(params: {
  file: File;
  buffer: Buffer;
  tenantId: string;
  userId: string;
}) {
  const { file, buffer, tenantId, userId } = params;
  const analysis = await withTimeout(analyzePolicyImages([buffer]), 'Image analysis');

  const safeName = sanitizeFileName(file.name);
  const upload = await uploadPolicyFile({
    userId,
    tenantId,
    file,
    buffer,
    safeName,
  });

  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 500 });
  }

  const newPolicy = await db
    .insert(policies)
    .values({
      id: nanoid(),
      tenantId,
      userId,
      provider: analysis.provider || 'Unknown',
      policyNumber: analysis.policyNumber ?? null,
      analysisJson: analysis,
      fileUrl: upload.filePath,
    })
    .returning();

  return NextResponse.json({
    success: true,
    policy: newPolicy[0],
    analysis,
    message: 'Policy analyzed from image upload',
  });
}

async function handlePdfAnalysis(params: {
  file: File;
  buffer: Buffer;
  tenantId: string;
  userId: string;
}) {
  const { file, buffer, tenantId, userId } = params;
  let textContent = '';

  try {
    const pdfModule = await import('pdf-parse');
    const pdf = pdfModule.default ?? pdfModule;
    const pdfData = await pdf(buffer);
    textContent = pdfData.text;
  } catch (pdfError: unknown) {
    console.error('PDF Parse Error (falling back to Vision):', pdfError);
    textContent = '';
  }

  if (!textContent || textContent.trim().length < 50) {
    return NextResponse.json(
      {
        error:
          'Scanned PDFs are not supported yet. Please upload a text-based PDF or a clear image.',
      },
      { status: 422 }
    );
  }

  const analysis = await withTimeout(analyzePolicyText(textContent), 'Text analysis');

  const safeName = sanitizeFileName(file.name);
  const upload = await uploadPolicyFile({
    userId,
    tenantId,
    file,
    buffer,
    safeName,
  });

  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 500 });
  }

  const [inserted] = await db
    .insert(policies)
    .values({
      id: nanoid(),
      tenantId,
      userId,
      fileUrl: upload.filePath,
      provider: analysis.provider || 'Unknown',
      policyNumber: analysis.policyNumber ?? null,
      analysisJson: analysis,
    })
    .returning();

  return NextResponse.json({
    success: true,
    policy: inserted,
    analysis,
  });
}
