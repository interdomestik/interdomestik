import { ensureTenantId, type SessionWithTenant } from '@interdomestik/shared-auth';
import { NextResponse } from 'next/server';

type TenantBoundaryResult =
  | { success: true; tenantId: string }
  | { success: false; response: NextResponse<{ error: string }> };

export function resolveTenantBoundary(session: SessionWithTenant): TenantBoundaryResult {
  try {
    return { success: true, tenantId: ensureTenantId(session) };
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: 'Missing tenant identity' }, { status: 401 }),
    };
  }
}
