import { confirmAdminUpload } from '@/features/admin/claims/actions';
import {
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';
import { confirmUpload } from '@/features/member/claims/actions';
import { LOCALES } from '@/i18n/locales';
import { auth } from '@/lib/auth';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { createAdminClient } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

const ADMIN_UPLOAD_ROLES = new Set([
  'admin',
  'super_admin',
  'tenant_admin',
  'branch_manager',
  'staff',
]);
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Invalid form payload' }, { status: 400 });
  }

  const claimId = formData.get('claimId');
  const category = formData.get('category');
  const locale = formData.get('locale');
  const file = formData.get('file');

  if (
    typeof claimId !== 'string' ||
    (category !== 'evidence' && category !== 'legal') ||
    typeof locale !== 'string' ||
    !LOCALES.includes(locale as (typeof LOCALES)[number]) ||
    !(file instanceof File)
  ) {
    return NextResponse.json({ error: 'Invalid form payload' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 413 });
  }

  const tenantId = ensureTenantId(session);
  const bucket = resolveEvidenceBucketName();
  const resolvedMimeType = resolveUploadMimeType(file);
  const storageContentType = resolveStorageUploadContentType(file);
  const extension = file.name.split('.').pop() || 'bin';
  const fileId = randomUUID();
  const storagePath = `pii/tenants/${tenantId}/claims/${claimId}/${fileId}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await createAdminClient()
    .storage.from(bucket)
    .upload(storagePath, buffer, {
      contentType: storageContentType,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message || 'Failed to upload evidence' },
      { status: 500 }
    );
  }

  const role = session.user.role ?? null;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const isAdminSurface = role
    ? ADMIN_UPLOAD_ROLES.has(role) && resolveTenantFromHost(host) === tenantId
    : false;

  const confirmResult = isAdminSurface
    ? await confirmAdminUpload({
        claimId,
        storagePath,
        originalName: file.name,
        mimeType: resolvedMimeType,
        fileSize: file.size,
        fileId,
        uploadedBucket: bucket,
        category,
      })
    : await confirmUpload({
        claimId,
        storagePath,
        originalName: file.name,
        mimeType: resolvedMimeType,
        fileSize: file.size,
        fileId,
        uploadedBucket: bucket,
        category,
      });

  if (!confirmResult.success) {
    return NextResponse.json({ error: confirmResult.error }, { status: confirmResult.status });
  }

  return NextResponse.json({ success: true, fileId, storagePath });
}
