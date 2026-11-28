'use server';

import { isClaimUploadPaused } from '@/features/claims/upload/server/claim-upload-cutover';

import { ClaimDocumentUploadConflictError } from '@/features/claims/upload/server/claim-document-upload-conflict';

import type { AuthorizedSession } from '@/lib/tenant-authority.server';
import { resolveMemberActorRoleOnSession } from '@/app/[locale]/(app)/member/actor-role-on-session';
import {
  createSignedUploadUrl,
  InformationRequestUploadConflictError,
  persistClaimDocumentAndQueueWorkflows,
  revalidatePathForAllLocales,
  validateConfirmedClaimUpload,
} from '@/features/claims/upload/server/shared-upload';
import {
  findOwnedMemberInformationRequest,
  findOwnedMemberUploadClaim,
} from '@/features/claims/upload/server/access';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { z } from 'zod';
import { buildMemberAiExtractionConsent, type ConfirmUploadParams } from './upload-consent';

const informationRequestIdSchema = z.uuid();

export type GenerateUploadUrlResult =
  | {
      success: true;
      url: string;
      path: string;
      id: string;
      token: string;
      bucket: string;
      deterministicE2E?: true;
      intentToken: string;
    }
  | { success: false; error: string; status: 400 | 401 | 403 | 404 | 413 | 500 };

export async function generateUploadUrl(
  claimId: string,
  fileName: string,
  contentType: string,
  fileSize: number,
  informationRequestId?: string,
  storageContentType?: string
): Promise<GenerateUploadUrlResult> {
  const admission = await requireAdmittedMember();
  if (!admission.ok) {
    return {
      success: false,
      error: admission.failure.code,
      status: admission.failure.code === 'UNAUTHORIZED' ? 401 : 403,
    };
  }
  const { session, authority } = admission.authorized;
  const { tenantId } = readTenantAuthority(authority);
  let evidenceBucket: string;
  try {
    evidenceBucket = resolveEvidenceBucketName();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[member/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }

  const claim = await findOwnedMemberUploadClaim({
    claimId,
    authority,
    role: session.user.role,
    userId: session.user.id,
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  if (informationRequestId) {
    const parsedRequestId = informationRequestIdSchema.safeParse(informationRequestId);
    if (!parsedRequestId.success) {
      return { success: false, error: 'Invalid information request', status: 400 };
    }
    if (
      !(await findOwnedMemberInformationRequest({
        claimId,
        informationRequestId: parsedRequestId.data,
        authority,
        userId: session.user.id,
      }))
    ) {
      return { success: false, error: 'Information request not found', status: 404 };
    }
  }

  return createSignedUploadUrl({
    authority,
    actorId: session.user.id,
    bucket: evidenceBucket,
    claimId,
    fileName,
    fileSize,
    informationRequestId,
    logPrefix: '[member/claims]',
    mimeType: contentType,
    selfSupply: true,
    storageContentType,
    tenantId,
  });
}

export type ConfirmUploadResult =
  { success: true } | { success: false; error: string; status: 400 | 401 | 403 | 404 | 409 | 500 };

type ConfirmUploadContext =
  | {
      success: true;
      actorRole: string;
      session: AuthorizedSession['session'];
      authority: TenantAuthority;
      tenantId: string;
      resolvedBucket: string;
    }
  | { success: false; error: string; status: 401 | 403 | 500 };

async function resolveConfirmUploadContext(): Promise<ConfirmUploadContext> {
  const admission = await requireAdmittedMember();
  if (!admission.ok) {
    return {
      success: false,
      error: admission.failure.code,
      status: admission.failure.code === 'UNAUTHORIZED' ? 401 : 403,
    };
  }
  const { session, authority } = admission.authorized;
  const actorRole = resolveMemberActorRoleOnSession(session.user.role);
  if (!actorRole) return { success: false, error: 'Unauthorized', status: 401 };
  try {
    return {
      success: true,
      actorRole,
      session,
      authority,
      tenantId: readTenantAuthority(authority).tenantId,
      resolvedBucket: resolveEvidenceBucketName(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[member/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }
}

function confirmUploadFailure(err: unknown): ConfirmUploadResult {
  if (err instanceof ClaimDocumentUploadConflictError) {
    return {
      success: false,
      error: 'Upload changed. Reload the case and check its documents.',
      status: 409,
    };
  }
  if (err instanceof InformationRequestUploadConflictError) {
    return { success: false, error: err.message, status: 409 };
  }
  console.error('confirmUpload error:', err);
  return { success: false, error: 'Failed to save document metadata', status: 500 };
}

export async function confirmUpload(params: ConfirmUploadParams): Promise<ConfirmUploadResult> {
  const {
    claimId,
    storagePath,
    originalName,
    mimeType,
    fileSize,
    fileId,
    uploadedBucket,
    category = 'evidence',
    informationRequestId,
  } = params;
  const uploadContext = await resolveConfirmUploadContext();
  if (!uploadContext.success) {
    return uploadContext;
  }
  const { actorRole, session, authority, tenantId, resolvedBucket } = uploadContext;

  if (informationRequestId && !informationRequestIdSchema.safeParse(informationRequestId).success) {
    return { success: false, error: 'Invalid information request', status: 400 };
  }

  const claim = await findOwnedMemberUploadClaim({
    claimId,
    authority,
    role: session.user.role,
    userId: session.user.id,
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  if (
    informationRequestId &&
    !(await findOwnedMemberInformationRequest({
      claimId,
      informationRequestId,
      authority,
      userId: session.user.id,
    }))
  ) {
    return { success: false, error: 'Information request not found', status: 404 };
  }

  try {
    if (await isClaimUploadPaused(authority, tenantId, claimId, 'self-supply')) {
      return { success: false, error: 'Forbidden', status: 403 };
    }
    if (uploadedBucket && uploadedBucket !== resolvedBucket) {
      console.error('[member/claims] confirmUpload bucket mismatch', {
        uploadedBucket,
        resolvedBucket,
      });
      return {
        success: false,
        error: 'Upload bucket mismatch detected. Please retry upload.',
        status: 409,
      };
    }

    const validatedUpload = await validateConfirmedClaimUpload({
      authority,
      actorId: session.user.id,
      bucket: resolvedBucket,
      confirmation: params,
      logPrefix: '[member/claims] confirmUpload',
      tenantId,
    });

    if (!validatedUpload.success) {
      return validatedUpload;
    }

    if (validatedUpload.replayed) return { success: true };

    await persistClaimDocumentAndQueueWorkflows({
      category,
      claimId,
      fileId,
      fileSize,
      informationRequestId,
      logPrefix: '[member/claims] confirmUpload',
      mimeType,
      originalName,
      resolvedBucket,
      storagePath,
      authority,
      tenantId,
      userId: session.user.id,
      // Ordinary uploads retain the canonical actor derived from the verified session.
      // Request-linked writes retain their existing fixed member transaction/audit contract.
      actorRole: informationRequestId ? undefined : actorRole,
      expectedClaimOwnerId: session.user.id,
      aiExtractionConsent: buildMemberAiExtractionConsent(params),
    });

    revalidatePathForAllLocales(`/member/claims/${claimId}`);
    if (informationRequestId) {
      revalidatePathForAllLocales(`/staff/claims/${claimId}`);
    }
    revalidatePathForAllLocales('/member/documents');
    return { success: true };
  } catch (err) {
    return confirmUploadFailure(err);
  }
}
