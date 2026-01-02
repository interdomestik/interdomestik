import { analyzePolicyImages, analyzePolicyText } from '@/lib/ai/policy-analyzer';
import { auth } from '@/lib/auth'; // Using better-auth
import { createAdminClient, db } from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

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

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.-]+/g, '_');
}

function formatError(prefix: string, error: unknown) {
  if (process.env.NODE_ENV === 'production') return prefix;
  const message = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${message}`;
}

async function uploadPolicyFile(args: {
  userId: string;
  file: File;
  buffer: Buffer;
  safeName: string;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: 'Supabase service role key is required for policy uploads.' };
  }

  const filePath = `pii/policies/${args.userId}/${Date.now()}_${args.safeName}`;
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

    // Check if this is a direct image upload (not a PDF)
    const isImage = file.type.startsWith('image/');

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
    if (isImage) {
      const analysis = await analyzePolicyImages([buffer]);

      const safeName = sanitizeFileName(file.name);
      const upload = await uploadPolicyFile({
        userId: session.user.id,
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
          userId: session.user.id,
          provider: analysis.provider,
          policyNumber: analysis.policyNumber,
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
    const analysis = await analyzePolicyText(textContent);

    // 3. Upload to Storage
    const safeName = sanitizeFileName(file.name);
    const upload = await uploadPolicyFile({
      userId: session.user.id,
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
        userId: session.user.id,
        fileUrl: upload.filePath,
        provider: analysis.provider || 'Unknown',
        policyNumber: analysis.policyNumber,
        analysisJson: analysis,
      })
      .returning();

    return NextResponse.json({
      success: true,
      policy: inserted,
      analysis,
    });
  } catch (error: unknown) {
    console.error('Policy Analysis Error:', error);
    // Return actual error message for debugging
    return NextResponse.json({ error: formatError('Server error', error) }, { status: 500 });
  }
}
