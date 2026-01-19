import { ApiErrorCode } from '@/core-contracts';
import { analyzePolicyImages, analyzePolicyText } from '@/lib/ai/policy-analyzer';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';
import { analyzePolicyCore } from './_core';

const POLICIES_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';

// Dependency Implementation: Upload
async function uploadPolicyFileService(args: {
  userId: string;
  tenantId: string;
  file: File;
  buffer: Buffer;
  safeName: string;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false as const,
      error: 'Supabase service role key is required for policy uploads.',
    };
  }

  const filePath = `pii/tenants/${args.tenantId}/policies/${args.userId}/${Date.now()}_${args.safeName}`;
  const adminClient = createAdminClient();
  const { error } = await adminClient.storage.from(POLICIES_BUCKET).upload(filePath, args.buffer, {
    contentType: args.file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    console.error('Supabase policy upload error:', error);
    return { ok: false as const, error: 'Failed to upload policy file' };
  }

  return { ok: true as const, filePath };
}

// Dependency Implementation: PDF Analysis
async function analyzePdfService(buffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import('pdf-parse');
    const pdf = pdfModule.default ?? pdfModule;
    const pdfData = await pdf(buffer);
    return pdfData.text;
  } catch (pdfError: unknown) {
    console.error('PDF Parse Error:', pdfError);
    return '';
  }
}

// Dependency Implementation: DB
async function savePolicyService(data: any) {
  const [inserted] = await db
    .insert(policies)
    .values({
      id: nanoid(),
      ...data,
    })
    .returning();
  return inserted;
}

// Timeout Wrapper Helper
const ANALYSIS_TIMEOUT_MS =
  Number.parseInt(process.env.POLICY_ANALYSIS_TIMEOUT_MS || '', 10) || 15_000;
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

// Wrapped AI Services
const analyzeImageWithTimeout = (buf: Buffer) =>
  withTimeout(analyzePolicyImages([buf]), 'Image analysis');
const analyzeTextWithTimeout = (text: string) =>
  withTimeout(analyzePolicyText(text), 'Text analysis');

export async function POST(req: NextRequest) {
  try {
    const headersList = req.headers;
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await enforceRateLimit({
      name: 'api:policy-analyze',
      limit: 5,
      windowSeconds: 60,
      headers: headersList,
    });
    if (limit) return limit;

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const arrayBuffer = await file?.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer || []); // Handle null safely

    const result = await analyzePolicyCore({
      file,
      buffer,
      session: {
        userId: session.user.id,
        tenantId: ensureTenantId(session),
      },
      deps: {
        uploadFile: uploadPolicyFileService,
        analyzeImage: analyzeImageWithTimeout,
        analyzePdf: analyzePdfService,
        analyzeText: analyzeTextWithTimeout,
        savePolicy: savePolicyService,
      },
    });

    if (result.ok) {
      return NextResponse.json(result.data);
    }

    // Map Error Codes to HTTP Status
    const statusMap: Record<ApiErrorCode, number> = {
      BAD_REQUEST: 400,
      PAYLOAD_TOO_LARGE: 413,
      UNPROCESSABLE_ENTITY: 422,
      TIMEOUT: 504,
      INTERNAL_ERROR: 500,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      CONFLICT: 409,
      RATE_LIMIT: 429,
    };

    return NextResponse.json({ error: result.message }, { status: statusMap[result.code] || 500 });
  } catch (error: unknown) {
    console.error('Handler Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
