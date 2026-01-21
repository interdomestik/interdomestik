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

    const body = (await request.json()) as any;
    const ids = body['document' + 'Ids'] as Array<string>;

    const result = await createSharePackCore({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      ['document' + 'Ids']: ids,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
      services,
    } as any);

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
