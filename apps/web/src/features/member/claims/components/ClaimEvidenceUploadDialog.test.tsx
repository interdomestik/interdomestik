import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';
import { runSharedEvidenceUploadDialogTests } from '@/features/claims/components/shared-evidence-upload-dialog.test-helpers';

const mocks = vi.hoisted(() => ({
  generateUploadUrl: vi.fn(),
  confirmUpload: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/features/member/claims/actions', () => ({
  generateUploadUrl: mocks.generateUploadUrl,
  confirmUpload: mocks.confirmUpload,
}));

vi.mock('@interdomestik/database/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: mocks.uploadToSignedUrl,
      }),
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
  }),
  usePathname: () => '/mk/member/claims/claim-1',
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('ClaimEvidenceUploadDialog AI extraction consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateUploadUrl.mockResolvedValue({
      success: true,
      bucket: 'claim-evidence',
      path: 'pii/tenants/t1/claims/c1/file.pdf',
      token: 'signed-token',
      intentToken: 'upload-intent-token',
      id: 'file-id',
    });
    mocks.uploadToSignedUrl.mockResolvedValue({ error: null });
    mocks.confirmUpload.mockResolvedValue({ success: true });
  });

  it('sends explicit member opt-in through signed upload confirmation', async () => {
    render(
      <ClaimEvidenceUploadDialog claimId="claim-1" trigger={<button type="button">Open</button>} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [new File(['dummy'], 'evidence.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText(/AI document extraction/u));
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(mocks.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          aiExtractionConsentGranted: true,
          aiExtractionConsentLocale: 'mk',
        })
      );
    });
  });

  it('does not carry opt-in across selected files', async () => {
    render(
      <ClaimEvidenceUploadDialog claimId="claim-1" trigger={<button type="button">Open</button>} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const fileInput = screen.getByLabelText('File');
    fireEvent.change(fileInput, {
      target: { files: [new File(['one'], 'one.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText(/AI document extraction/u));
    fireEvent.change(fileInput, {
      target: { files: [new File(['two'], 'two.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(mocks.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({ aiExtractionConsentGranted: false })
      );
    });
  });
});

runSharedEvidenceUploadDialogTests({
  dialogName: 'ClaimEvidenceUploadDialog',
  fileLabel: 'File',
  openButtonLabel: 'Open',
  renderDialog: () => (
    <ClaimEvidenceUploadDialog claimId="claim-1" trigger={<button type="button">Open</button>} />
  ),
  uploadMocks: {
    confirmUpload: mocks.confirmUpload,
    fetch: mocks.fetch,
    generateUploadUrl: mocks.generateUploadUrl,
    refresh: mocks.refresh,
    toastError: mocks.toastError,
    toastSuccess: mocks.toastSuccess,
    uploadToSignedUrl: mocks.uploadToSignedUrl,
  },
  uploadSuccessText: 'Evidence uploaded successfully',
  uploadTriggerLabel: 'Upload',
  uploadUrlMockName: 'generateUploadUrl',
  confirmMockName: 'confirmUpload',
});
