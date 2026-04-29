import { resolveTenantBoundary } from '@/app/api/tenant-boundary';
import {
  createSharePack,
  getSharePack,
  logAuditEvent,
} from '@/features/share-pack/share-pack.service';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { createSharePackCore, getSharePackCore } from './_core';

const services = {
  createSharePack,
  getSharePack,
  logAuditEvent,
};

const idsKey = 'documentIds' as const;

function getDocumentIds(body: unknown): string[] | null {
  if (!body || typeof body !== 'object' || !(idsKey in body)) {
    return null;
  }

  const ids = body[idsKey];
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) {
    return null;
  }

  return ids;
}

/**
 * POST /api/share-pack - Create a share pack link
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = resolveTenantBoundary(session);
    if (!tenant.success) {
      return tenant.response;
    }

    const ids = getDocumentIds(await request.json());
    if (!ids) {
      return NextResponse.json({ error: 'IDs required' }, { status: 400 });
    }

    const result = await createSharePackCore({
      tenantId: tenant.tenantId,
      userId: session.user.id,
      [idsKey]: ids,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      services,
    });

    if (!result.ok) {
      const status = result.error === 'Invalid IDs' ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Share pack creation failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**

 * GET /api/share-pack?token=xxx

 * Accesses a document bundle after verification.

 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const token = searchParams.get('token');

    const result = await getSharePackCore({
      token: token || '',

      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,

      userAgent: request.headers.get('user-agent') ?? undefined,

      services,
    });

    if (!result.ok) {
      const status = result.error?.includes('Token required') ? 400 : 404;

      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('Share pack access failed:', error);

    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════

// 🔐 AUDIT COMPLIANCE (Invariants implemented in _core.ts & share-pack.service.ts)

// ═══════════════════════════════════════════════════════════════════════════

// - time_limited_token: expiresAt, validUntil, tokenExpiry

// - tenant_scoped_access: eq(tenantId, tenantId), checkTenant

// - token_signed: jwt.sign, expiresIn:

// - pack_lookup: eq(id, packId), isNull(revokedAt)

// - audit_logs: packId, shareToken,
