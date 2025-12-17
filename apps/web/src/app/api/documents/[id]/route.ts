import { auth } from '@/lib/auth';
import { claimDocuments, createAdminClient, db } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

// GET /api/documents/[id] - Generate signed download URL
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch document metadata
  const [doc] = await db.select().from(claimDocuments).where(eq(claimDocuments.id, id));

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // TODO: Add proper RBAC check
  // For now, allow if user is admin/agent OR is the document owner
  const userRole = session.user.role as string | undefined;
  const isPrivileged = userRole === 'admin' || userRole === 'agent';
  const isOwner = doc.uploadedBy === session.user.id;

  if (!isPrivileged && !isOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Generate signed URL for download
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from(doc.bucket)
    .createSignedUrl(doc.filePath, 60 * 5); // 5 minute expiry

  if (error || !data?.signedUrl) {
    console.error('Failed to create signed download URL', error);
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
  }

  return NextResponse.json({
    url: data.signedUrl,
    name: doc.name,
    type: doc.fileType,
    size: doc.fileSize,
    expiresIn: 300,
  });
}
