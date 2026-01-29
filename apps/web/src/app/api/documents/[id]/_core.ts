import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@interdomestik/database';

import { createSignedDownloadUrlCore, getDocumentAccessCore } from '../_core';

const storageService = {
  createSignedUrl: async (bucket: string, path: string, expiresIn: number) => {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(path, expiresIn);
    return { signedUrl: data?.signedUrl || undefined, error: error || undefined };
  },
  download: async () => ({}), // Not used in this route
};

// GET /api/documents/[id] - Generate signed download URL
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit({
    name: 'api/documents',
    limit: 60,
    windowSeconds: 60,
    headers: _request.headers,
  });
  if (limited) return limited;

  const { id } = await params;

  const session = await auth.api.getSession({ headers: _request.headers });

  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await getDocumentAccessCore({
    session,
    documentId: id,
    mode: 'signed_url',
    deps: { db, storage: storageService },
  });

  const userRole = (session.user.role as string | undefined) ?? undefined;
  const tenantId = (session.user as { tenantId?: string | null }).tenantId ?? null;

  if (!access.ok) {
    const statusMap: Record<string, number> = {
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
        actorRole: userRole ?? null,
        tenantId,
        action: 'document.forbidden',
        entityType: 'claim_document',
        entityId: id,
        metadata: { error: access.message },
        headers: _request.headers,
      });
    }

    return Response.json({ error: access.message }, { status: statusMap[access.code] || 500 });
  }

  await logAuditEvent({
    actorId: session.user.id,
    actorRole: access.audit.actorRole,
    tenantId,
    action: access.audit.action,
    entityType: access.audit.entityType,
    entityId: access.audit.entityId,
    metadata: access.audit.metadata,
    headers: _request.headers,
  });

  const urlResult = await createSignedDownloadUrlCore({
    bucket: access.document.bucket,
    filePath: access.document.filePath,
    expiresInSeconds: 60 * 5,
    deps: { db, storage: storageService },
  });

  if (!urlResult.ok) {
    console.error('Failed to create signed download URL');
    return Response.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return Response.json({
    url: urlResult.signedUrl,
    name: access.document.name,
    type: access.document.fileType,
    size: access.document.fileSize,
    expiresIn: 300,
  });
}
