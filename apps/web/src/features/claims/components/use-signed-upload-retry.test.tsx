import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SignedUploadDraft, useSignedUploadRetry } from './use-signed-upload-retry';

const deps = {
  confirmUpload: vi.fn(),
  generateUploadUrl: vi.fn(),
  uploadToStorage: vi.fn(),
};

const ORIGINAL: SignedUploadDraft = {
  category: 'legal',
  consentGranted: true,
  file: new File(['pdf'], 'evidence.pdf', { type: 'application/pdf' }),
};
const CHANGED: SignedUploadDraft = {
  category: 'evidence',
  consentGranted: false,
  file: new File(['other'], 'other.pdf', { type: 'application/pdf' }),
};

function renderRetry() {
  return renderHook(() =>
    useSignedUploadRetry({
      claimId: 'claim-1',
      locale: 'en',
      recoveryHref: '/en/member/claims/claim-1',
      ...deps,
    })
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  deps.generateUploadUrl.mockResolvedValue({
    success: true,
    bucket: 'claim-evidence',
    path: 'pii/tenants/t1/claims/claim-1/file-id.pdf',
    token: 'signed-token',
    intentToken: 'intent-1',
    id: 'file-id',
  });
  deps.uploadToStorage.mockResolvedValue(undefined);
  deps.confirmUpload.mockResolvedValue({ success: true });
});

describe('useSignedUploadRetry', () => {
  it('admits one synchronous attempt and releases only its own', () => {
    const { result } = renderRetry();
    const attempts: Array<symbol | null> = [];

    act(() => {
      attempts.push(result.current.acquire(), result.current.acquire());
    });
    expect(typeof attempts[0]).toBe('symbol');
    expect(attempts[1]).toBeNull();
    expect(result.current.uploading).toBe(true);

    act(() => result.current.release(Symbol('foreign attempt')));
    expect(result.current.uploading).toBe(true);
    expect(result.current.acquire()).toBeNull();

    act(() => result.current.release(attempts[0] as symbol));
    expect(result.current.uploading).toBe(false);
  });

  it('replays the same frozen confirmation after a thrown confirm and clears it on success', async () => {
    deps.confirmUpload.mockRejectedValueOnce(new Error('Network response lost'));
    const { result } = renderRetry();

    await act(async () => {
      await expect(result.current.uploadSigned(ORIGINAL)).rejects.toThrow('Network response lost');
    });
    expect(result.current.pending?.stage).toBe('confirm');
    expect(result.current.pending?.confirmation).toBeDefined();
    expect(Object.isFrozen(result.current.pending?.confirmation)).toBe(true);

    let documentId = '';
    await act(async () => {
      documentId = await result.current.uploadSigned(CHANGED);
    });

    expect(documentId).toBe('file-id');
    expect(deps.generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(deps.uploadToStorage).toHaveBeenCalledTimes(1);
    expect(deps.confirmUpload).toHaveBeenCalledTimes(2);
    expect(deps.confirmUpload.mock.calls[1]?.[0]).toBe(deps.confirmUpload.mock.calls[0]?.[0]);
    expect(deps.confirmUpload.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        aiExtractionConsentGranted: true,
        aiExtractionConsentLocale: 'en',
        category: 'legal',
        fileId: 'file-id',
        originalName: 'evidence.pdf',
        uploadIntentToken: 'intent-1',
      })
    );
    expect(result.current.pending).toBeNull();
  });

  it('stops before confirm when storage fails and retries the original target', async () => {
    deps.uploadToStorage.mockRejectedValueOnce(new Error('Storage offline'));
    const { result } = renderRetry();

    await act(async () => {
      await expect(result.current.uploadSigned(ORIGINAL)).rejects.toThrow('Storage offline');
    });
    expect(deps.confirmUpload).not.toHaveBeenCalled();
    expect(result.current.pending?.stage).toBe('storage');

    await act(async () => {
      await result.current.uploadSigned(CHANGED);
    });
    expect(deps.generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(deps.uploadToStorage).toHaveBeenCalledTimes(2);
    expect(deps.uploadToStorage.mock.calls[1]?.[0]).toBe(deps.uploadToStorage.mock.calls[0]?.[0]);
    expect(deps.uploadToStorage.mock.calls[1]?.[1]).toBe(ORIGINAL.file);
    expect(deps.confirmUpload).toHaveBeenCalledTimes(1);
  });

  it('keeps no identity when the signed intent is refused', async () => {
    deps.generateUploadUrl.mockResolvedValueOnce({ success: false, error: 'Claim not found' });
    const { result } = renderRetry();

    await act(async () => {
      await expect(result.current.uploadSigned(ORIGINAL)).rejects.toThrow('Claim not found');
    });
    expect(result.current.pending).toBeNull();
    expect(deps.uploadToStorage).not.toHaveBeenCalled();
    expect(deps.confirmUpload).not.toHaveBeenCalled();
  });
});
