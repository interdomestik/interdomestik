import { ApiErrorCode } from '@/core-contracts';
import { enforceRateLimit } from '@/lib/rate-limit';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { NextRequest, NextResponse } from 'next/server';
import { analyzePolicyCore } from './_core';
import {
  emitPolicyExtractionRequestedService,
  markPolicyAnalysisRunDispatchFailedService,
  queuePolicyAnalysisService,
  uploadPolicyFileService,
} from './_services';

export async function POST(req: NextRequest) {
  try {
    const headersList = req.headers;
    const authorized = await authorizeSessionTenant(headersList);

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = await enforceRateLimit({
      name: 'api:policy-analyze',
      limit: 5,
      windowSeconds: 60,
      headers: headersList,
      productionSensitive: true,
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
        userId: authorized.session.user.id,
        authority: authorized.authority,
      },
      deps: {
        uploadFile: uploadPolicyFileService,
        queuePolicyAnalysis: queuePolicyAnalysisService,
        emitRequestedRun: emitPolicyExtractionRequestedService,
        markRunDispatchFailed: markPolicyAnalysisRunDispatchFailedService,
      },
    });

    if (result.ok) {
      return NextResponse.json(result.data, { status: 202 });
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

    return NextResponse.json(
      { error: result.message ?? 'Server error' },
      { status: statusMap[result.code] || 500 }
    );
  } catch (error: unknown) {
    console.error('Handler Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
