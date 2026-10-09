'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';
import type {
  ConfirmUploadFn,
  EvidenceCategory,
  GenerateUploadUrlFn,
} from './shared-evidence-upload-types';

export type SignedUploadDraft = {
  category: EvidenceCategory;
  consentGranted: boolean;
  file: File;
};

export class SignedUploadRetryError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'SignedUploadRetryError';
  }
}

export class SignedUploadIdentityChangedError extends SignedUploadRetryError {
  constructor() {
    super('Return to the original case to resolve this upload.', 409);
    this.name = 'SignedUploadIdentityChangedError';
  }
}

export type SignedUploadConfirmation = Readonly<Parameters<ConfirmUploadFn>[0]>;

export type SignedUploadTarget = Readonly<{
  bucket: string;
  deterministicE2E: boolean;
  path: string;
  token: string;
}>;

/**
 * A signed upload whose outcome is not yet known. `storage` means the signed transfer has not
 * succeeded; `confirm` means a confirmation may already have committed, so only the exact same
 * confirmation may be sent again.
 */
export type PendingSignedUpload = Readonly<
  SignedUploadDraft & {
    confirmation: SignedUploadConfirmation;
    recoveryHref: string;
    stage: 'confirm' | 'storage';
    target: SignedUploadTarget;
  }
>;

export type SignedStorageUploader = (
  target: SignedUploadTarget,
  file: File,
  contentType: string
) => Promise<void>;

type SignedUploadRetryOptions = {
  claimId: string;
  confirmUpload: ConfirmUploadFn;
  generateUploadUrl: GenerateUploadUrlFn;
  informationRequestId?: string;
  locale: string;
  recoveryHref: string;
  uploadToStorage: SignedStorageUploader;
};

function storageFileFor(file: File, mimeType: string, contentType: string): File {
  return contentType === mimeType
    ? file
    : new File([file], file.name, { type: contentType, lastModified: file.lastModified });
}

/**
 * Keeps one signed upload identity per mounted dialog until its confirmation succeeds. Retries after
 * any failure reuse the original intent, storage target, and frozen confirmation; no new intent or
 * id is requested while a pending upload exists. In-memory only: a reload or unmount drops it.
 */
export function useSignedUploadRetry({
  claimId,
  confirmUpload,
  generateUploadUrl,
  informationRequestId,
  locale,
  recoveryHref,
  uploadToStorage,
}: SignedUploadRetryOptions) {
  const identityRef = useRef({ claimId, informationRequestId });
  useLayoutEffect(() => {
    identityRef.current = { claimId, informationRequestId };
  }, [claimId, informationRequestId]);
  const matchesCurrentIdentity = (confirmation: SignedUploadConfirmation) =>
    confirmation.claimId === identityRef.current.claimId &&
    confirmation.informationRequestId === identityRef.current.informationRequestId;
  const assertCurrentIdentity = (confirmation: SignedUploadConfirmation) => {
    if (!matchesCurrentIdentity(confirmation)) {
      throw new SignedUploadIdentityChangedError();
    }
  };
  const attemptRef = useRef<symbol | null>(null);
  const pendingRef = useRef<PendingSignedUpload | null>(null);
  const [pending, setPending] = useState<PendingSignedUpload | null>(null);
  const [uploading, setUploading] = useState(false);

  const keepPending = (next: PendingSignedUpload | null) => {
    pendingRef.current = next;
    setPending(next);
  };

  /** Synchronous guard: admits one attempt before React commits the disabled button. */
  const acquire = useCallback((): symbol | null => {
    if (attemptRef.current) return null;
    const attempt = Symbol('signed-upload-attempt');
    attemptRef.current = attempt;
    setUploading(true);
    return attempt;
  }, []);

  /** Releases the guard only for the attempt that acquired it. */
  const release = useCallback((attempt: symbol) => {
    if (attemptRef.current !== attempt) return;
    attemptRef.current = null;
    setUploading(false);
  }, []);

  const getPending = useCallback(() => pendingRef.current, []);

  const requestSignedTarget = async (draft: SignedUploadDraft): Promise<PendingSignedUpload> => {
    const { file } = draft;
    const mimeType = resolveUploadMimeType(file);
    const storageContentType = resolveStorageUploadContentType(file);
    const result = informationRequestId
      ? await generateUploadUrl(
          claimId,
          file.name,
          mimeType,
          file.size,
          informationRequestId,
          storageContentType
        )
      : await generateUploadUrl(claimId, file.name, mimeType, file.size);
    if (!result.success) throw new SignedUploadRetryError(result.error, result.status);

    const target: SignedUploadTarget = {
      bucket: result.bucket,
      deterministicE2E: result.deterministicE2E === true,
      path: result.path,
      token: result.token,
    };
    const confirmation: SignedUploadConfirmation = {
      claimId,
      storagePath: result.path,
      originalName: file.name,
      mimeType,
      fileSize: file.size,
      fileId: result.id,
      informationRequestId,
      uploadIntentToken: result.intentToken,
      storageContentType,
      uploadedBucket: result.bucket,
      category: draft.category,
      aiExtractionConsentGranted: draft.consentGranted,
      aiExtractionConsentLocale: locale,
    };
    const created: PendingSignedUpload = {
      category: draft.category,
      consentGranted: draft.consentGranted,
      file,
      stage: 'storage',
      target,
      confirmation,
      recoveryHref,
    };
    Object.freeze(target);
    Object.freeze(confirmation);
    Object.freeze(created);
    keepPending(created);
    return created;
  };

  /**
   * Runs or resumes the signed upload. When a pending upload exists the supplied draft is ignored so
   * the original file, category, and consent can never change between attempts.
   */
  const uploadSigned = async (draft: SignedUploadDraft): Promise<string> => {
    let current = pendingRef.current ?? (await requestSignedTarget(draft));
    assertCurrentIdentity(current.confirmation);
    if (current.stage === 'storage') {
      const { mimeType, storageContentType = mimeType } = current.confirmation;
      if (!current.target.deterministicE2E) {
        await uploadToStorage(
          current.target,
          storageFileFor(current.file, mimeType, storageContentType),
          storageContentType
        );
      }
      const confirming: PendingSignedUpload = { ...current, stage: 'confirm' };
      Object.freeze(confirming);
      keepPending(confirming);
      current = confirming;
    }

    // A changed mounted claim/request must never submit the previous pending identity.
    assertCurrentIdentity(current.confirmation);
    const result = await confirmUpload(current.confirmation);
    assertCurrentIdentity(current.confirmation);
    if (!result.success) throw new SignedUploadRetryError(result.error, result.status);
    if (pendingRef.current === current) keepPending(null);
    return current.confirmation.fileId;
  };

  const identityMatches =
    !pending ||
    (pending.confirmation.claimId === claimId &&
      pending.confirmation.informationRequestId === informationRequestId);
  return { identityMatches, acquire, getPending, pending, release, uploadSigned, uploading };
}
