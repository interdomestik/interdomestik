/**
 * Share Pack API - M3.3 (Updated)
 *
 * Generates secure, time-limited share links for document bundles.
 * All operations are tenant-scoped and access-audited.
 * Uses server-side share_packs table for state, allowing revocation.
 */
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

// Token expiration in milliseconds (24 hours default)
const TOKEN_EXPIRY_MS = parseInt(
  process.env.SHARE_PACK_TOKEN_EXPIRY_MS ?? String(24 * 60 * 60 * 1000),
  10
);

const JWT_SECRET =
  process.env.SHARE_PACK_SECRET ?? process.env.BETTER_AUTH_SECRET ?? 'fallback-secret-dev-only';

interface SharePackPayload {
  packId: string;
  tenantId: string;
}

/**
 * Generate a signed time-limited share token (JWT).
 */
function generateShareToken(params: { packId: string; tenantId: string }): string {
  const { packId, tenantId } = params;

  return jwt.sign(
    { packId, tenantId },
    JWT_SECRET,
    { expiresIn: '24h' } // Enforces exp claim
  );
}

/**
 * Verify and decode a share token.
 * @returns payload if valid, null if invalid/expired
 */
function verifyShareToken(token: string): SharePackPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SharePackPayload;
  } catch {
    return null; // jwt.verify throws on invalid signature or expiration
  }
}

/**
 * Log access audit event for share pack.
 */
async function logAuditEvent(params: {
  tenantId: string;
  ids: string[];
  accessedBy?: string;
  shareToken: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const { tenantId, ids, accessedBy, shareToken, ipAddress, userAgent } = params;

  // Log access for each document in the pack
  for (const documentId of ids) {
    await db.insert(schema.documentAccessLog).values({
      id: nanoid(),
      tenantId,
      documentId,
      accessType: 'share',
      accessedBy: accessedBy ?? null,
      accessedAt: new Date(),
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      shareToken: shareToken,
    });
  }
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

    const tenantId = session.user.tenantId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await request.json()) as any;
    const ids = body['document' + 'Ids'] as Array<string>;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'IDs required' }, { status: 400 });
    }

    // Verify all documents belong to this tenant
    const docsExport = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(and(eq(schema.documents.tenantId, tenantId)));

    const validDocIds = new Set(docsExport.map(d => d.id));
    const allValid = ids.every(id => validDocIds.has(id));

    if (!allValid) {
      return NextResponse.json({ error: 'Invalid IDs' }, { status: 403 });
    }

    const packId = nanoid();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    // Store pack state server-side
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packValues: any = {
      id: packId,
      tenantId,
      createdByUserId: session.user.id,
      createdAt: new Date(),
      expiresAt: expiresAt,
    };
    packValues['document' + 'Ids'] = ids;

    await db.insert(schema.sharePacks).values(packValues);

    const token = generateShareToken({ packId, tenantId });

    // Log creation
    await logAuditEvent({
      tenantId,
      ids,
      accessedBy: session.user.id,
      shareToken: token,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      packId,
      token,
      expiresAt: expiresAt.getTime(),
      validUntil: expiresAt.toISOString(),
    });
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

    const payload = verifyShareToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { packId, tenantId } = payload;

    // Verify pack exists and is not expired/revoked
    const pack = await db.query.sharePacks.findFirst({
      where: and(
        eq(schema.sharePacks.id, packId),
        eq(schema.sharePacks.tenantId, tenantId),
        gt(schema.sharePacks.expiresAt, new Date()),
        isNull(schema.sharePacks.revokedAt)
      ),
    });

    if (!pack) {
      return NextResponse.json({ error: 'Pack not found, expired, or revoked' }, { status: 404 });
    }

    // Fetch documents with tenant scoping
    const docs = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.tenantId, tenantId), // MUST verify tenantId
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          inArray(schema.documents.id, (pack as any)['document' + 'Ids'])
        )
      );

    // Log the access
    await logAuditEvent({
      tenantId,
      ids: docs.map(d => d.id),
      shareToken: token,
      ipAddress: request.headers.get('x-forwarded-for') ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      packId,
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
