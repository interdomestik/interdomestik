import { logAuditEvent } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { claimDocuments, claims, createAdminClient, db } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

function safeFilename(value: string) {
  // Keep it simple; rely on filename* encoding for non-ascii.
  return value.replace(/[\r\n"]/g, '_');
}

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

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dispositionParam = url.searchParams.get('disposition');
  const disposition: 'inline' | 'attachment' =
    dispositionParam === 'inline' ? 'inline' : 'attachment';

  // Fetch document metadata + claim ownership for RBAC
  const [row] = await db
    .select({
      doc: claimDocuments,
      claimOwnerId: claims.userId,
    })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(eq(claimDocuments.id, id));

  if (!row?.doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const doc = row.doc;

  const userRole = session.user.role as string | undefined;
  const isPrivileged = userRole === 'admin' || userRole === 'staff';
  const isClaimOwner = row.claimOwnerId === session.user.id;
  const isUploader = doc.uploadedBy === session.user.id;

  if (!isPrivileged && !isClaimOwner && !isUploader) {
    await logAuditEvent({
      actorId: session.user.id,
      actorRole: userRole ?? null,
      action: 'document.forbidden',
      entityType: 'claim_document',
      entityId: id,
      metadata: {
        claimId: doc.claimId,
        bucket: doc.bucket,
        filePath: doc.filePath,
        disposition,
      },
      headers: request.headers,
    });

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await logAuditEvent({
    actorId: session.user.id,
    actorRole: userRole ?? null,
    action: disposition === 'inline' ? 'document.view' : 'document.download',
    entityType: 'claim_document',
    entityId: id,
    metadata: {
      claimId: doc.claimId,
      bucket: doc.bucket,
      filePath: doc.filePath,
      fileType: doc.fileType,
      fileSize: doc.fileSize,
      disposition,
    },
    headers: request.headers,
  });

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage.from(doc.bucket).download(doc.filePath);

  if (error || !data) {
    console.error('Failed to download document from storage', error);
    return NextResponse.json({ error: 'Failed to download document' }, { status: 500 });
  }

  const filename = safeFilename(doc.name || 'document');
  const encoded = encodeURIComponent(filename);

  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': doc.fileType || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${filename}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
