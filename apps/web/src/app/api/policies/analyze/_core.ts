import { ApiResult } from '@/core-contracts';

// Dependencies needed by the core
export interface AnalyzePolicyDeps {
  uploadFile: (args: {
    userId: string;
    tenantId: string;
    file: File;
    buffer: Buffer;
    safeName: string;
  }) => Promise<{ ok: true; filePath: string } | { ok: false; error: string }>;
  analyzeImage: (buffer: Buffer) => Promise<any>; // Using any for analysis result DTO for now
  analyzePdf: (buffer: Buffer) => Promise<string>; // Returns text content
  analyzeText: (text: string) => Promise<any>;
  savePolicy: (policy: any) => Promise<any>;
}

export interface AnalyzePolicyParams {
  file: File;
  buffer: Buffer; // Passed explicitly to avoid async arrayBuffer() in core
  session: { userId: string; tenantId: string };
  deps: AnalyzePolicyDeps;
}

const MAX_UPLOAD_BYTES =
  Number.parseInt(process.env.POLICY_UPLOAD_MAX_BYTES || '', 10) || 15_000_000;
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
  return name.replaceAll(/[^\w.-]+/g, '_');
}

export async function analyzePolicyCore(params: AnalyzePolicyParams): Promise<ApiResult<any>> {
  const { file, buffer, session, deps } = params;

  // 1. Validation
  if (!file) {
    return { ok: false, code: 'BAD_REQUEST', message: 'No file provided' };
  }

  if (!isValidUpload(file)) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: 'Only PDF and image uploads are supported (PDF, JPEG, PNG, WebP)',
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'File too large' };
  }

  const safeName = sanitizeFileName(file.name);
  let analysisResult;

  try {
    const isImage = isImageFile(file, buffer);

    if (isImage) {
      analysisResult = await deps.analyzeImage(buffer);
    } else {
      // PDF Flow
      const textContent = await deps.analyzePdf(buffer);
      if (!textContent || textContent.trim().length < 50) {
        return {
          ok: false,
          code: 'UNPROCESSABLE_ENTITY',
          message:
            'Scanned PDFs are not supported yet. Please upload a text-based PDF or a clear image.',
        };
      }
      analysisResult = await deps.analyzeText(textContent);
    }

    // 2. Upload
    const uploadResult = await deps.uploadFile({
      userId: session.userId,
      tenantId: session.tenantId,
      file,
      buffer,
      safeName,
    });

    if (!uploadResult.ok) {
      return { ok: false, code: 'INTERNAL_ERROR', message: uploadResult.error };
    }

    // 3. Save to DB
    const policy = await deps.savePolicy({
      tenantId: session.tenantId,
      userId: session.userId,
      provider: analysisResult.provider || 'Unknown',
      policyNumber: analysisResult.policyNumber ?? null,
      analysisJson: analysisResult,
      fileUrl: uploadResult.filePath,
    });

    return {
      ok: true,
      data: {
        success: true,
        policy,
        analysis: analysisResult,
        message: isImage ? 'Policy analyzed from image upload' : undefined,
      },
    };
  } catch (error: any) {
    if (error.name === 'PolicyAnalysisTimeoutError' || error.message?.includes('timed out')) {
      return { ok: false, code: 'TIMEOUT', message: error.message };
    }
    return { ok: false, code: 'INTERNAL_ERROR', error };
  }
}
