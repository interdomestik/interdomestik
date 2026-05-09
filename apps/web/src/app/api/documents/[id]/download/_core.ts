import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db.server';
import { enforceRateLimit } from '@/lib/rate-limit';

import {
  DOCUMENT_ACCESS_STATUS_BY_CODE,
  buildContentDispositionHeader,
  downloadStorageFileCore,
  getDocumentAccessCore,
  logAllowedDocumentAccess,
  logDeniedDocumentAccess,
} from '../../_core';
import { createDocumentDownloadStorageService } from '../../storage-service.server';

const storageService = createDocumentDownloadStorageService();

// GET /api/documents/[id]/download
// Streams the file via Supabase Admin client so we can enforce RBAC and write access logs.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit({
    name: 'api/documents:download',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const { id } = await params;

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
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
    deps: { db, storage: storageService },
  });

  const tenantId = (session.user as { tenantId?: string | null }).tenantId ?? null;

  if (!access.ok) {
    await logDeniedDocumentAccess({
      access,
      documentId: id,
      headers: request.headers,
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
    headers: request.headers,
    logAuditEvent,
    session,
    tenantId,
  });

  const file = await downloadStorageFileCore({
    bucket: access.document.bucket,
    filePath: access.document.filePath,
    family: access.storageFamily,
    deps: { db, storage: storageService },
    tenantId: access.tenantId,
  });

  if (!file.ok) {
    // DEV DX: Return dummy content for seeded data if storage is missing file
    if (
      (process.env.NODE_ENV === 'development' || process.env.INTERDOMESTIK_AUTOMATED === '1') &&
      id.startsWith('pack_')
    ) {
      return new Response(
        'Dummy Seed Content for Development\n(Real file missing in local storage)',
        {
          status: 200,
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `${disposition}; filename="dummy_seed.txt"`,
            'Cache-Control': 'private, no-store',
          },
        }
      );
    }

    console.error('Failed to download document from storage');
    return Response.json({ error: 'Failed to download document' }, { status: 500 });
  }

  const filename = access.document.name || 'document';

  const body = 'stream' in file.data ? file.data.stream() : file.data;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': access.document.fileType || 'application/octet-stream',
      'Content-Disposition': buildContentDispositionHeader({ disposition, filename }),
      'Cache-Control': 'private, no-store',
    },
  });
}
