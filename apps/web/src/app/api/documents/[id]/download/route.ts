import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

import { downloadStorageFileCore, getDocumentAccessCore, safeFilename } from '../../_core';

// GET /api/documents/[id]/download
// Streams the file via Supabase Admin client so we can enforce RBAC and write access logs.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit({
    name: 'api/documents:download',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  const { id } = await params;

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dispositionParam = url.searchParams.get('disposition');
  const disposition: 'inline' | 'attachment' =
    dispositionParam === 'inline' ? 'inline' : 'attachment';

  const access = await getDocumentAccessCore({
    session,
    documentId: id,
    mode: 'download',
    disposition,
  });

  const userRole = (session.user.role as string | undefined) ?? undefined;

  if (!access.ok) {
    if (access.status === 404) {
      return NextResponse.json({ error: access.error }, { status: 404 });
    }

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: userRole ?? null,
      action: access.audit.action,
      entityType: access.audit.entityType,
      entityId: access.audit.entityId,
      metadata: access.audit.metadata,
      headers: request.headers,
    });

    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  await logAuditEvent({
    actorId: session.user.id,
    actorRole: access.audit.actorRole,
    action: access.audit.action,
    entityType: access.audit.entityType,
    entityId: access.audit.entityId,
    metadata: access.audit.metadata,
    headers: request.headers,
  });

  const file = await downloadStorageFileCore({
    bucket: access.document.bucket,
    filePath: access.document.filePath,
  });

  if (!file.ok) {
    console.error('Failed to download document from storage');
    return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
  }

  const filename = safeFilename(access.document.name || 'document');
  const encoded = encodeURIComponent(filename);

  const body = 'stream' in file.data ? file.data.stream() : file.data;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': access.document.fileType || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${filename}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
