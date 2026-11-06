import { performHealthCheck, resolveBuildMetadata } from '@/features/health/health.service';
import { observeDeployedRuntimeAuthority } from '@/features/health/runtime-attestation';
import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getHealthApiCore } from './_core';
import { handleRuntimeAttestation } from './attestation-core';

const NO_STORE = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET(_request: NextRequest) {
  const result = await getHealthApiCore({
    performHealthCheckFn: performHealthCheck,
  });

  const { statusCode, ...data } = result;

  return NextResponse.json(data.data || data, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

export async function HEAD(_request: NextRequest) {
  const result = await getHealthApiCore({
    performHealthCheckFn: performHealthCheck,
  });

  return new NextResponse(null, { status: result.statusCode });
}

/** U2-e: the super-admin runtime authority observation; see attestation-core.ts. */
export async function POST(request: NextRequest) {
  const result = await handleRuntimeAttestation(request, {
    getSession: headers => auth.api.getSession({ headers }),
    observe: observeDeployedRuntimeAuthority,
    commitSha: () => resolveBuildMetadata().commitSha,
    now: () => new Date(),
  });
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}
