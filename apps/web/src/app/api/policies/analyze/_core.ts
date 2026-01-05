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
  // Check MIME type first
  if (file.type.startsWith('image/')) return true;

  // Fallback to extension
  const lower = file.name.toLowerCase();
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  ) {
    return true;
  }

  // Fallback to magic bytes
  if (buffer.length >= 4) {
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return true;
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
    // WebP: RIFF....WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.length >= 12
    ) {
      if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50)
        return true;
    }
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

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await req.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate Limit: 5 requests per minute per user/IP to prevent cost spikes
    const limit = await enforceRateLimit({
      name: 'api:policy-analyze',
      limit: 5,
      windowSeconds: 60,
      headers: await req.headers,
    });

    // Return the response directly (can be 429 or 503 with proper headers)
    if (limit) {
      return limit;
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!isValidUpload(file)) {
      return NextResponse.json(
        { error: 'Only PDF and image uploads are supported (PDF, JPEG, PNG, WebP)' },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if this is a direct image upload (not a PDF) - using magic bytes fallback
    const isImage = isImageFile(file, buffer);

    // 1. Extract Text (only for PDFs)
    let textContent = '';
    if (!isImage) {
      try {
        // Lazy load pdf-parse to avoid top-level failures
        const pdfModule = await import('pdf-parse');
        const pdf = pdfModule.default ?? pdfModule;
        const pdfData = await pdf(buffer);
        textContent = pdfData.text;
      } catch (pdfError: unknown) {
        // Fallback to Vision API if text extraction fails.
        console.error('PDF Parse Error (falling back to Vision):', pdfError);
        textContent = '';
      }
    }

    // 2. Use Vision API for images or scanned PDFs
    const tenantId = ensureTenantId(session);

    if (isImage) {
      const analysis = await withTimeout(analyzePolicyImages([buffer]), 'Image analysis');

      const safeName = sanitizeFileName(file.name);
      const upload = await uploadPolicyFile({
        userId: session.user.id,
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
          userId: session.user.id,
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

    if (!textContent || textContent.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            'Scanned PDFs are not supported yet. Please upload a text-based PDF or a clear image.',
        },
        { status: 422 }
      );
    }

    // 2. AI Analysis (text-based)
    const analysis = await withTimeout(analyzePolicyText(textContent), 'Text analysis');

    // 3. Upload to Storage
    const safeName = sanitizeFileName(file.name);
    const upload = await uploadPolicyFile({
      userId: session.user.id,
      tenantId,
      file,
      buffer,
      safeName,
    });

    if (!upload.ok) {
      return NextResponse.json({ error: upload.error }, { status: 500 });
    }

    // 4. Save to DB
    const [inserted] = await db
      .insert(policies)
      .values({
        id: nanoid(),
        tenantId,
        userId: session.user.id,
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
  } catch (error: unknown) {
    if (error instanceof PolicyAnalysisTimeoutError) {
      return NextResponse.json({ error: error.message }, { status: 504 });
    }
    console.error('Policy Analysis Error:', error);
    // Return actual error message for debugging
    return NextResponse.json({ error: formatError('Server error', error) }, { status: 500 });
  }
}
