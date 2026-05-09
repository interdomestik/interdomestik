import { ApiErrorCode } from '@/core-contracts';
import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createTenantSignedDownloadUrl } from '@/lib/storage/service-role';
import { NextResponse } from 'next/server';
import { createSignedDownloadUrlCore, getDocumentAccessCore } from '../_core';

// Service Adapter
const storageService = {
  createSignedUrl: async (
    bucket: string,
    path: string,
    expiresIn: number,
    options: { family: 'claims' | 'policies'; tenantId: string }
  ) => {
    const { data, error } = await createTenantSignedDownloadUrl({
      bucket,
      context: 'document signed URL',
      expiresInSeconds: expiresIn,
      family: options.family,
      path,
      tenantId: options.tenantId,
    });
    return { signedUrl: data?.signedUrl || undefined, error: error || undefined };
  },
  download: async (_bucket: string, _path: string, _options: unknown) => ({}), // Not used in this route
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit({
    name: 'api/documents',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const { id } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await getDocumentAccessCore({
    session,
    documentId: id,
    mode: 'signed_url',
    deps: { db, storage: storageService },
  });

  if (!access.ok) {
    const statusMap: Record<ApiErrorCode, number> = {
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      UNAUTHORIZED: 401,
      BAD_REQUEST: 400,
      CONFLICT: 409,
      RATE_LIMIT: 429,
      INTERNAL_ERROR: 500,
      TIMEOUT: 504,
      PAYLOAD_TOO_LARGE: 413,
      UNPROCESSABLE_ENTITY: 422,
    };

    if (access.code === 'FORBIDDEN') {
      await logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role || null,
        action: 'document.forbidden',
        entityType: 'claim_document',
        entityId: id,
        metadata: { error: access.message },
        headers: request.headers,
      });
    }

    return NextResponse.json({ error: access.message }, { status: statusMap[access.code] || 500 });
  }

  // Success Audit
  await logAuditEvent({
    actorId: session.user.id,
    actorRole: access.audit.actorRole,
    action: access.audit.action,
    entityType: access.audit.entityType,
    entityId: access.audit.entityId,
    metadata: access.audit.metadata,
    headers: request.headers,
  });

  const urlResult = await createSignedDownloadUrlCore({
    bucket: access.document.bucket,
    filePath: access.document.filePath,
    expiresInSeconds: 60 * 5,
    family: access.storageFamily,
    deps: { db, storage: storageService },
    tenantId: access.tenantId,
  });

  if (!urlResult.ok) {
    console.error('Failed to create signed download URL');
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({
    url: urlResult.signedUrl,
    name: access.document.name,
    type: access.document.fileType,
    size: access.document.fileSize,
    expiresIn: 300,
  });
}
