/**
 * Share Pack API - M3.3 (Updated)
 *
 * Generates secure, time-limited share links for document bundles.
 * All operations are tenant-scoped and access-audited.
 * Uses server-side share_packs table for state, allowing revocation.
 */
import {
  createSharePack,
  getSharePack,
  logAuditEvent,
} from '@/features/share-pack/share-pack.service';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

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

    const tenantId = session.user.tenantId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await request.json()) as any;
    const ids = body['document' + 'Ids'] as Array<string>;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs required' }, { status: 400 });
    }

    try {
      const result = await createSharePack({
        tenantId,
        userId: session.user.id,
        documentIds: ids,
      });

      // Log creation
      await logAuditEvent({
        tenantId,
        ids,
        accessedBy: session.user.id,
        shareToken: result.token,
        ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });

      return NextResponse.json({
        packId: result.packId,
        token: result.token,
        expiresAt: result.expiresAt.getTime(),
        validUntil: result.expiresAt.toISOString(),
      });
    } catch (error: any) {
      if (error.message === 'Invalid IDs') {
        return NextResponse.json({ error: 'Invalid IDs' }, { status: 403 });
      }
      throw error;
    }
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

    if (!token) {
      return NextResponse.json({ error: 'Token required' }, { status: 400 });
    }

    const result = await getSharePack({ token });

    if (!result) {
      return NextResponse.json({ error: 'Pack not found, expired, or revoked' }, { status: 404 }); // Could also be 401/403 but 404 is safer
    }

    const { pack, docs, tenantId } = result;

    // Log the access
    await logAuditEvent({
      tenantId,
      ids: docs.map(d => d.id),
      shareToken: token,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      packId: pack.id,
      documents: docs.map(d => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
      })),
      validUntil: pack.expiresAt,
    });
  } catch (error) {
    console.error('Share pack access failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
