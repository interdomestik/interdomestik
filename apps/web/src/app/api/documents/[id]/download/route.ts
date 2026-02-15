import { ApiErrorCode } from '@/core-contracts';
import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@interdomestik/database';
import { NextResponse } from 'next/server';
import { downloadStorageFileCore, getDocumentAccessCore, safeFilename } from '../../_core';

// Service Adapter
const storageService = {
  createSignedUrl: async () => ({}),
  download: async (bucket: string, path: string) => {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.storage.from(bucket).download(path);
    return { data: data || undefined, error: error || undefined };
  },
};

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

  // Audit logs are tenant-scoped. Session should carry tenantId (via shared-auth).
  const tenantId = (session.user as { tenantId?: string | null }).tenantId ?? null;

  const url = new URL(request.url);
  const dispositionParam = url.searchParams.get('disposition');
  const disposition: 'inline' | 'attachment' =
    dispositionParam === 'inline' ? 'inline' : 'attachment';

  const access = await getDocumentAccessCore({
    session,
    documentId: id,
    mode: 'download',
    disposition,
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
        tenantId,
        action: 'document.forbidden',
        entityType: 'claim_document',
        entityId: id,
        metadata: { error: access.message },
        headers: request.headers,
      });
    }

    return NextResponse.json({ error: access.message }, { status: statusMap[access.code] || 500 });
  }

  await logAuditEvent({
    actorId: session.user.id,
    actorRole: access.audit.actorRole,
    tenantId,
    action: access.audit.action as any,
    entityType: access.audit.entityType,
    entityId: access.audit.entityId,
    metadata: access.audit.metadata,
    headers: request.headers,
  });

  const file = await downloadStorageFileCore({
    bucket: access.document.bucket,
    filePath: access.document.filePath,
    deps: { db, storage: storageService },
  });

  if (!file.ok) {
    // DEV DX: Return dummy content if missing
    if (process.env.NODE_ENV === 'development' && id.startsWith('pack_')) {
      return new Response('Dummy Seed Content for Development', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `${disposition}; filename="dummy_seed.txt"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    console.error('Failed to download document from storage');
    return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
  }

  const filename = safeFilename(access.document.name || 'document');
  const encoded = encodeURIComponent(filename);

  const body = 'stream' in file.data ? (file.data as any).stream() : file.data;

  return new Response(body as any, {
    status: 200,
    headers: {
      'Content-Type': access.document.fileType || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${filename}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
