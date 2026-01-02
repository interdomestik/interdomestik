import { analyzePolicyText } from '@/lib/ai/policy-analyzer';
import { auth } from '@/lib/auth'; // Using better-auth
import { db } from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { NextRequest, NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES =
  Number.parseInt(process.env.POLICY_UPLOAD_MAX_BYTES || '', 10) || 15_000_000;
const MAX_SCAN_PAGES = 5;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

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

// Initialize Supabase Client for Storage (using Service Role for upload if needed, or standard client)
// Assuming we use the standard client for now, or the one from @interdomestik/domain-claims if available
// For simplicity in this Task, I will use a direct generic client here or just mock the upload if credentials aren't perfect.
// BUT, I should check internal tools.

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
    if (isImage || !textContent || textContent.trim().length < 50) {
      const logMessage = isImage
        ? 'Direct image upload detected, using Vision API...'
        : 'No text found, attempting Vision API with image conversion...';
      console.log(logMessage);

      try {
        let imageBuffers: Buffer[];

        if (isImage) {
          // Direct image upload - use as-is
          imageBuffers = [buffer];
        } else {
          // Scanned PDF - convert to images
          const { convert } = await import('pdf-img-convert');

          const pdfImages = await convert(buffer, {
            width: 2000,
            height: 2000,
            page_numbers: Array.from({ length: MAX_SCAN_PAGES }, (_, i) => i + 1),
          });

          // Ensure we have an array of buffers (convert Uint8Array to Buffer)
          imageBuffers = (Array.isArray(pdfImages) ? pdfImages : [pdfImages]).map(img =>
            Buffer.from(img)
          );

          if (imageBuffers.length === 0) {
            return NextResponse.json({ error: 'Could not convert PDF to images' }, { status: 400 });
          }
        }

        // Use Vision API
        const { analyzePolicyImages } = await import('@/lib/ai/policy-analyzer');
        const analysis = await analyzePolicyImages(imageBuffers);

        // Continue with storage and database steps
        const safeName = sanitizeFileName(file.name);
        const fileUrl = `https://storage.interdomestik.com/policies/${session.user.id}/${Date.now()}_${safeName}`;

        const newPolicy = await db
          .insert(policies)
          .values({
            userId: session.user.id,
            provider: analysis.provider,
            policyNumber: analysis.policyNumber,
            analysisJson: analysis,
            fileUrl,
          })
          .returning();

        const successMessage = isImage
          ? 'Policy analyzed from image using Vision AI'
          : 'Policy analyzed using Vision AI (scanned document)';

        return NextResponse.json({
          success: true,
          policy: newPolicy[0],
          message: successMessage,
        });
      } catch (visionError: unknown) {
        console.error('Vision API Error:', visionError);
        return NextResponse.json(
          { error: formatError('Could not analyze scanned PDF', visionError) },
          { status: 500 }
        );
      }
    }

    // 2. AI Analysis (text-based)
    const analysis = await analyzePolicyText(textContent);

    // 3. Upload to Storage (Mocking for now)
    const safeName = sanitizeFileName(file.name);
    const fileUrl = `https://storage.interdomestik.com/policies/${session.user.id}/${Date.now()}_${safeName}`;

    // 4. Save to DB
    const [inserted] = await db
      .insert(policies)
      .values({
        userId: session.user.id,
        fileUrl: fileUrl,
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
