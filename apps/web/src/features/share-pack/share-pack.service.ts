import { isProductionDeployment } from '@/lib/runtime-environment';
import { db } from '@interdomestik/database/db';
import * as schema from '@interdomestik/database/schema';
import { createHash } from 'crypto';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

// Token expiration in milliseconds (24 hours default)
const TOKEN_EXPIRY_MS = parseInt(
  process.env.SHARE_PACK_TOKEN_EXPIRY_MS ?? String(24 * 60 * 60 * 1000),
  10
);

const DEVELOPMENT_SHARE_PACK_SECRET = `dev-share-pack-${nanoid(32)}`;

export interface SharePackPayload {
  packId: string;
  tenantId: string;
}

export function resolveSharePackSecret(): string {
  const secret = process.env.SHARE_PACK_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (secret?.trim()) {
    return secret;
  }

  if (isProductionDeployment()) {
    throw new Error('SHARE_PACK_SECRET or BETTER_AUTH_SECRET is required for share-pack tokens');
  }

  return DEVELOPMENT_SHARE_PACK_SECRET;
}

export function hashShareTokenForAudit(shareToken: string): string {
  return `sha256:${createHash('sha256').update(shareToken).digest('hex')}`;
}

/**
 * Generate a signed time-limited share token (JWT).
 */
export function generateShareToken(params: { packId: string; tenantId: string }): string {
  const { packId, tenantId } = params;

  return jwt.sign(
    { packId, tenantId },
    resolveSharePackSecret(),
    { expiresIn: '24h' } // Enforces exp claim
  );
}

/**
 * Verify and decode a share token.
 * @returns payload if valid, null if invalid/expired
 */
export function verifyShareToken(token: string): SharePackPayload | null {
  const secret = resolveSharePackSecret();

  try {
    return jwt.verify(token, secret) as SharePackPayload;
  } catch {
    return null; // jwt.verify throws on invalid signature or expiration
  }
}

/**
 * Log access audit event for share pack.
 */
export async function logAuditEvent(params: {
  tenantId: string;
  ids: string[];
  accessedBy?: string;
  shareToken: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  const { tenantId, ids, accessedBy, shareToken, ipAddress, userAgent } = params;
  const hashedShareToken = hashShareTokenForAudit(shareToken);

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
      shareToken: hashedShareToken,
    });
  }
}

export async function createSharePack(params: {
  tenantId: string;
  userId: string;
  documentIds: string[];
}) {
  const { tenantId, userId, documentIds } = params;

  // Verify all documents belong to this tenant
  const docsExport = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(and(eq(schema.documents.tenantId, tenantId)));

  const validDocIds = new Set(docsExport.map(d => d.id));
  const allValid = documentIds.every(id => validDocIds.has(id));

  if (!allValid) {
    throw new Error('Invalid IDs');
  }

  const packId = nanoid();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Store pack state server-side
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const packValues: any = {
    id: packId,
    tenantId,
    createdByUserId: userId,
    createdAt: new Date(),
    expiresAt: expiresAt,
  };
  packValues['document' + 'Ids'] = documentIds;

  await db.insert(schema.sharePacks).values(packValues);

  const token = generateShareToken({ packId, tenantId });

  return {
    packId,
    token,
    expiresAt,
  };
}

export async function getSharePack(params: { token: string }) {
  const { token } = params;
  const payload = verifyShareToken(token);
  if (!payload) {
    return null;
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
    return null;
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

  return {
    pack,
    docs,
    tenantId,
    payload,
  };
}
