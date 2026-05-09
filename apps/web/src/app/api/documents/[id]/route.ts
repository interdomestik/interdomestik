import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { signedUrlResponseInit } from '@/lib/storage/signed-url-exposure';
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

  await logAllowedDocumentAccess({
    access,
    headers: request.headers,
    logAuditEvent,
    session,
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

  return NextResponse.json(
    {
      url: urlResult.signedUrl,
      name: access.document.name,
      type: access.document.fileType,
      size: access.document.fileSize,
      expiresIn: 300,
    },
    signedUrlResponseInit()
  );
}
