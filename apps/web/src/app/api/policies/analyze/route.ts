import { ApiErrorCode } from '@/core-contracts';
import { analyzePolicyImages, analyzePolicyText } from '@/lib/ai/policy-analyzer';
import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { NextRequest, NextResponse } from 'next/server';
import { analyzePolicyCore } from './_core';
import { analyzePdfService, savePolicyService, uploadPolicyFileService } from './_services';

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
