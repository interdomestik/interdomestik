import { logAuditEvent } from '@/lib/audit';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { signedUrlResponseInit } from '@/lib/storage/signed-url-exposure';
import { usesDeterministicE2EStorage } from '@/lib/storage/service-role';
import { NextResponse } from 'next/server';
import {
  DOCUMENT_ACCESS_STATUS_BY_CODE,
  createSignedDownloadUrlCore,
  getDocumentAccessCore,
  logAllowedDocumentAccess,
  logDeniedDocumentAccess,
} from '../_core';
import { createDocumentSignedUrlStorageService } from '../storage-service.server';

const storageService = createDocumentSignedUrlStorageService();

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
  // The session and its tenant authority come from one authorization of this request.
  const authorized = await authorizeSessionTenant(request.headers);

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { authority, session } = authorized;

  const access = await getDocumentAccessCore({
    authority,
    session,
    documentId: id,
    mode: 'signed_url',
    deps: { db, storage: storageService },
  });

  if (!access.ok) {
    await logDeniedDocumentAccess({
      access,
      documentId: id,
      headers: request.headers,
      logAuditEvent,
      session,
    });

    return NextResponse.json(
      { error: access.message },
      { status: DOCUMENT_ACCESS_STATUS_BY_CODE[access.code] || 500 }
    );
  }

  const useAuthenticatedProxy = usesDeterministicE2EStorage();
  const urlResult = useAuthenticatedProxy
    ? {
        ok: true as const,
        signedUrl: `/api/documents/${encodeURIComponent(id)}/download`,
      }
    : await createSignedDownloadUrlCore({
        bucket: access.document.bucket,
        downloadName: access.document.name || 'document',
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

  await logAllowedDocumentAccess({
    access,
    headers: request.headers,
    logAuditEvent,
    session,
  });

  return NextResponse.json(
    {
      url: urlResult.signedUrl,
      name: access.document.name,
      type: access.document.fileType,
      size: access.document.fileSize,
      expiresIn: 300,
      ...(useAuthenticatedProxy ? { delivery: 'authenticated-proxy' } : {}),
    },
    signedUrlResponseInit()
  );
}
