import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import { createSignedDownloadUrlCore, getDocumentAccessCore } from '../_core';

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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await getDocumentAccessCore({
    session,
    documentId: id,
    mode: 'signed_url',
  });

  const userRole = (session.user.role as string | undefined) ?? undefined;
  const tenantId = (session.user as { tenantId?: string | null }).tenantId ?? null;

  if (!access.ok) {
    if (access.status === 404) {
      return NextResponse.json({ error: access.error }, { status: 404 });
    }

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: userRole ?? null,
      tenantId,
      action: access.audit.action,
      entityType: access.audit.entityType,
      entityId: access.audit.entityId,
      metadata: access.audit.metadata,
      headers: _request.headers,
    });

    return NextResponse.json({ error: access.error }, { status: 403 });
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
