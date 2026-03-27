import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminClaimEvidenceUploadDialog } from './AdminClaimEvidenceUploadDialog';

const mocks = vi.hoisted(() => ({
  generateAdminUploadUrl: vi.fn(),
  confirmAdminUpload: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock('@/features/admin/claims/actions', () => ({
  generateAdminUploadUrl: mocks.generateAdminUploadUrl,
  confirmAdminUpload: mocks.confirmAdminUpload,
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
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    const messages: Record<string, string> = {
      'admin.claims_page.evidence.dialog_title': 'Upload Evidence',
      'admin.claims_page.evidence.dialog_description':
        'Attach photos or documents relevant to this claim.',
      'admin.claims_page.evidence.document_type_label': 'Document Type',
      'admin.claims_page.evidence.file_label': 'File',
      'admin.claims_page.evidence.document_type_placeholder': 'Select document type',
      'admin.claims_page.evidence.types.evidence': 'Evidence',
      'admin.claims_page.evidence.types.legal': 'Legal document',
      'admin.claims_page.evidence.upload_button': 'Upload',
      'admin.claims_page.evidence.uploading': 'Uploading...',
      'admin.claims_page.evidence.upload_success': 'Evidence uploaded successfully',
      'admin.claims_page.evidence.upload_failed': 'Failed to upload evidence',
      'common.cancel': 'Cancel',
    };

    return messages[namespace ? `${namespace}.${key}` : key] ?? key;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('AdminClaimEvidenceUploadDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateAdminUploadUrl.mockResolvedValue({
      success: true,
      bucket: 'claim-evidence',
      path: 'pii/tenants/t1/claims/c1/file.pdf',
      token: 'signed-token',
      id: 'file-id',
    });
    mocks.uploadToSignedUrl.mockResolvedValue({ error: null });
    mocks.confirmAdminUpload.mockResolvedValue({ success: true });
  });

  function openDialog() {
    render(
      <AdminClaimEvidenceUploadDialog
        claimId="claim-1"
        trigger={<button type="button">Open upload</button>}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open upload' }));
  }

  it('opens the native file picker when upload is clicked without a selected file', () => {
    openDialog();

    const fileInput = screen.getByLabelText('File');
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mocks.generateAdminUploadUrl).not.toHaveBeenCalled();
  });

  it('uploads the selected file and refreshes the route', async () => {
    openDialog();

    const file = new File(['dummy'], 'evidence.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(mocks.generateAdminUploadUrl).toHaveBeenCalledWith(
        'claim-1',
        'evidence.pdf',
        'application/pdf',
        file.size
      );
      expect(mocks.uploadToSignedUrl).toHaveBeenCalled();
      expect(mocks.confirmAdminUpload).toHaveBeenCalledWith({
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
});
