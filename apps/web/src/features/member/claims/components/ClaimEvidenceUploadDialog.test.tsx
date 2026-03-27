import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';

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

describe('ClaimEvidenceUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.generateUploadUrl.mockResolvedValue({
      success: true,
      bucket: 'claim-evidence',
      path: 'pii/tenants/t1/claims/c1/file.pdf',
      token: 'signed-token',
      id: 'file-id',
    });
    mocks.uploadToSignedUrl.mockResolvedValue({ error: null });
    mocks.confirmUpload.mockResolvedValue({ success: true });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  function openDialog() {
    render(<ClaimEvidenceUploadDialog claimId="claim-1" trigger={<button>Open</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  }

  it('opens the native file picker when upload is clicked without a selected file', () => {
    openDialog();

    const fileInput = screen.getByLabelText('File');
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mocks.generateUploadUrl).not.toHaveBeenCalled();
  });

  it('uploads the selected file and refreshes the route', async () => {
    openDialog();

    const file = new File(['dummy'], 'evidence.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(mocks.generateUploadUrl).toHaveBeenCalledWith(
        'claim-1',
        'evidence.pdf',
        'application/pdf',
        file.size
      );
      expect(mocks.uploadToSignedUrl).toHaveBeenCalled();
      expect(mocks.confirmUpload).toHaveBeenCalledWith({
        claimId: 'claim-1',
        storagePath: 'pii/tenants/t1/claims/c1/file.pdf',
        originalName: 'evidence.pdf',
        mimeType: 'application/pdf',
        fileSize: file.size,
        fileId: 'file-id',
        uploadedBucket: 'claim-evidence',
        category: 'evidence',
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Evidence uploaded successfully');
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('derives a mime type from the extension when the browser provides an empty file type', async () => {
    openDialog();

    const file = new File(['dummy'], 'evidence.docx', { type: '' });
    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith('/api/claims/evidence-upload', {
        method: 'POST',
        body: expect.any(FormData),
      });
      expect(mocks.generateUploadUrl).not.toHaveBeenCalled();
      expect(mocks.confirmUpload).not.toHaveBeenCalled();
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
