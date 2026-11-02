import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClientMetadata, safeJson } from '@/app/api/request-guard';
import { auth } from '@/lib/auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { MissingTenantError } from '@interdomestik/shared-auth';

import { requestDataDeletionCore } from './_core';

const requestBodySchema = z.preprocess(
  value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value;
  },
  z.object({ reason: z.string().nullable().optional() }).passthrough()
);

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await safeJson(request, requestBodySchema, {
    allowEmptyBody: true,
    emptyBody: {},
    invalidJsonData: {},
  });
  if (!parsed.ok) return parsed.response;

  const clientMetadata = getClientMetadata(request.headers);
  const user = session.user as {
    id?: string;
    role?: string | null;
  };

  // A session without a tenant gets the core's "Missing tenantId" response, as before.
  let authority: TenantAuthority | null = null;
  try {
    authority = (await authorizeSessionTenant(request.headers))?.authority ?? null;
  } catch (error) {
    if (!(error instanceof MissingTenantError)) throw error;
  }

  const result = await requestDataDeletionCore({
    userId: user.id || '',
    authority,
    actorRole: user.role ?? null,
    reason: parsed.data.reason,
    ipAddress: clientMetadata.ipAddress,
    userAgent: clientMetadata.userAgent,
  });

  return NextResponse.json(result.body, { status: result.status });
}
