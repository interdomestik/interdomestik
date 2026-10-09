import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSignedUploadRetry } from './use-signed-upload-retry';

const draft = {
  category: 'evidence' as const,
  consentGranted: false,
  file: new File(['pdf'], 'evidence.pdf', { type: 'application/pdf' }),
};
function setup() {
  const confirmUpload = vi
    .fn()
    .mockResolvedValue({ success: false, status: 401, error: 'Unauthorized' });
  const generateUploadUrl = vi.fn().mockResolvedValue({
    success: true,
    bucket: 'claim-evidence',
    path: 'synthetic/file.pdf',
    token: 'signed',
    intentToken: 'intent',
    id: 'file-1',
  });
  const uploadToStorage = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    ({ claimId, informationRequestId }: { claimId: string; informationRequestId?: string }) =>
      useSignedUploadRetry({
        claimId,
        informationRequestId,
        recoveryHref: '/en/member/claims/original',
        locale: 'en',
        confirmUpload,
        generateUploadUrl,
        uploadToStorage,
      }),
    { initialProps: { claimId: 'original', informationRequestId: undefined as string | undefined } }
  );
  return { ...hook, confirmUpload, generateUploadUrl, uploadToStorage };
}

describe('pending signed upload ownership', () => {
  it('preserves the existing action status and original recovery destination', async () => {
    const { result } = setup();
    await act(async () => {
      await expect(result.current.uploadSigned(draft)).rejects.toMatchObject({
        status: 401,
        message: 'Unauthorized',
      });
    });
    expect(result.current.pending?.recoveryHref).toBe('/en/member/claims/original');
    expect(result.current.pending?.stage).toBe('confirm');
  });

  it.each([
    { claimId: 'different', informationRequestId: undefined },
    { claimId: 'original', informationRequestId: 'new-request' },
  ])('never resubmits the old pending identity after props change to %j', async next => {
    const { result, rerender, confirmUpload, generateUploadUrl, uploadToStorage } = setup();
    await act(async () => {
      await expect(result.current.uploadSigned(draft)).rejects.toMatchObject({ status: 401 });
    });
    const pending = result.current.pending;
    rerender(next);
    expect(result.current.identityMatches).toBe(false);
    await act(async () => {
      await expect(result.current.uploadSigned(draft)).rejects.toMatchObject({ status: 409 });
    });
    expect(result.current.pending).toBe(pending);
    expect(confirmUpload).toHaveBeenCalledTimes(1);
    expect(generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(uploadToStorage).toHaveBeenCalledTimes(1);
  });

  it.each([
    { claimId: 'different', informationRequestId: undefined },
    { claimId: 'original', informationRequestId: 'new-request' },
  ])(
    'stops before confirmation if the displayed identity changes during storage to %j',
    async next => {
      const { result, rerender, confirmUpload, uploadToStorage } = setup();
      let resolveStorage!: () => void;
      uploadToStorage.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            resolveStorage = resolve;
          })
      );
      let outcome!: Promise<unknown>;
      await act(async () => {
        outcome = result.current.uploadSigned(draft).catch(error => error);
      });
      rerender(next);
      let error: unknown;
      await act(async () => {
        resolveStorage();
        error = await outcome;
      });
      expect(error).toMatchObject({ status: 409 });
      expect(confirmUpload).not.toHaveBeenCalled();
      expect(result.current.pending?.stage).toBe('confirm');
      expect(result.current.pending?.confirmation.claimId).toBe('original');
      expect(result.current.pending?.recoveryHref).toBe('/en/member/claims/original');
      expect(result.current.identityMatches).toBe(false);
    }
  );
});
