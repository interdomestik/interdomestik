import { confirmAdminUpload } from '@/features/admin/claims/actions';
import {
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';
import { canAccessClaimFromAdminUploadSurface } from '@/features/claims/upload/server/access';
import { confirmUpload } from '@/features/member/claims/actions';
import { LOCALES } from '@/i18n/locales';
import { auth } from '@/lib/auth';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { claims, createAdminClient, db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

const ADMIN_UPLOAD_ROLES = new Set([
  'admin',
  'super_admin',
  'tenant_admin',
  'branch_manager',
  'staff',
]);
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function isAdminUploadRole(role: string | null | undefined): boolean {
  return role ? ADMIN_UPLOAD_ROLES.has(role) : false;
}

async function validateClaimAccess(params: {
  branchId?: string | null;
  claimId: string;
  role: string | null | undefined;
  tenantId: string;
  host: string;
  userId: string;
}): Promise<{ success: true; isAdminSurface: boolean } | { success: false; status: 401 | 404 }> {
  const { claimId, role, tenantId, host, userId } = params;
  const isAdminSurface = isAdminUploadRole(role) && resolveTenantFromHost(host) === tenantId;

  const claim = await db.query.claims.findFirst({
    where: isAdminSurface
      ? and(eq(claims.id, claimId), eq(claims.tenantId, tenantId))
      : and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), eq(claims.userId, userId)),
    columns: {
      id: true,
      branchId: true,
      staffId: true,
      userId: true,
    },
  });

  if (!claim) {
    return { success: false, status: 404 };
  }

  if (
    isAdminSurface &&
    !canAccessClaimFromAdminUploadSurface({
      branchId: params.branchId ?? null,
      claim,
      role,
      userId,
    })
  ) {
    return { success: false, status: 404 };
  }

  return { success: true, isAdminSurface };
}

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

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let bucket: string;
  try {
    bucket = resolveEvidenceBucketName();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Invalid storage configuration for tenant evidence bucket';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const role = session.user.role ?? null;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const claimAccess = await validateClaimAccess({
    branchId: session.user.branchId ?? null,
    claimId,
    role,
    tenantId,
    host,
    userId: session.user.id,
  });

  if (!claimAccess.success) {
    return NextResponse.json(
      { error: claimAccess.status === 404 ? 'Claim not found' : 'Unauthorized' },
      { status: claimAccess.status }
    );
  }

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

  const confirmResult = claimAccess.isAdminSurface
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
    Sentry.captureMessage('claim.evidence_upload.confirm_failed_after_storage_upload', {
      level: 'warning',
      extra: {
        claimId,
        tenantId,
        userId: session.user.id,
        role,
        fileId,
        bucket,
        storagePath,
        category,
        confirmStatus: confirmResult.status,
        confirmError: confirmResult.error,
      },
    });
    return NextResponse.json({ error: confirmResult.error }, { status: confirmResult.status });
  }

  return NextResponse.json({ success: true, fileId, storagePath });
}
