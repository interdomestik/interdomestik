import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';

import {
  DOCUMENT_ACCESS_STATUS_BY_CODE,
  createSignedDownloadUrlCore,
  getDocumentAccessCore,
  logAllowedDocumentAccess,
  logDeniedDocumentAccess,
} from '../_core';
import { createDocumentSignedUrlStorageService } from '../storage-service.server';

const storageService = createDocumentSignedUrlStorageService();

// GET /api/documents/[id] - Generate signed download URL
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit({
    name: 'api/documents',
    limit: 60,
    windowSeconds: 60,
    headers: _request.headers,
    productionSensitive: true,
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

  const tenantId = (session.user as { tenantId?: string | null }).tenantId ?? null;

  if (!access.ok) {
    await logDeniedDocumentAccess({
      access,
      documentId: id,
      headers: _request.headers,
      logAuditEvent,
      session,
      tenantId,
    });

    return Response.json(
      { error: access.message },
      { status: DOCUMENT_ACCESS_STATUS_BY_CODE[access.code] || 500 }
    );
  }

  await logAllowedDocumentAccess({
    access,
    headers: _request.headers,
    logAuditEvent,
    session,
    tenantId,
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
