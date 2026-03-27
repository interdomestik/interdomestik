import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UploadMocks = {
  confirmUpload: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
  generateUploadUrl: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  toastError: ReturnType<typeof vi.fn>;
  toastSuccess: ReturnType<typeof vi.fn>;
  uploadToSignedUrl: ReturnType<typeof vi.fn>;
};

type RenderDialog = () => React.ReactElement;

interface SharedDialogTestOptions {
  dialogName: string;
  fileLabel: string;
  openButtonLabel: string;
  renderDialog: RenderDialog;
  uploadMocks: UploadMocks;
  uploadSuccessText: string;
  uploadTriggerLabel: string;
  uploadUrlMockName: 'generateAdminUploadUrl' | 'generateUploadUrl';
  confirmMockName: 'confirmAdminUpload' | 'confirmUpload';
}

export function runSharedEvidenceUploadDialogTests({
  dialogName,
  fileLabel,
  openButtonLabel,
  renderDialog,
  uploadMocks,
  uploadSuccessText,
  uploadTriggerLabel,
  uploadUrlMockName,
  confirmMockName,
}: SharedDialogTestOptions) {
  describe(dialogName, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubGlobal('fetch', uploadMocks.fetch);
      uploadMocks.generateUploadUrl.mockResolvedValue({
        success: true,
        bucket: 'claim-evidence',
        path: 'pii/tenants/t1/claims/c1/file.pdf',
        token: 'signed-token',
        id: 'file-id',
      });
      uploadMocks.uploadToSignedUrl.mockResolvedValue({ error: null });
      uploadMocks.confirmUpload.mockResolvedValue({ success: true });
      uploadMocks.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
    });

    const openDialog = () => {
      render(renderDialog());
      fireEvent.click(screen.getByRole('button', { name: openButtonLabel }));
    };

    it('opens the native file picker when upload is clicked without a selected file', () => {
      openDialog();

      const fileInput = screen.getByLabelText(fileLabel);
      const clickSpy = vi.spyOn(fileInput, 'click');

      fireEvent.click(screen.getByRole('button', { name: uploadTriggerLabel }));

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(uploadMocks.generateUploadUrl).not.toHaveBeenCalled();
    });

    it('uploads the selected file and refreshes the route', async () => {
      openDialog();

      const file = new File(['dummy'], 'evidence.pdf', { type: 'application/pdf' });
      fireEvent.change(screen.getByLabelText(fileLabel), {
        target: { files: [file] },
      });

      fireEvent.click(screen.getByRole('button', { name: uploadTriggerLabel }));

      await waitFor(() => {
        expect(uploadMocks.generateUploadUrl).toHaveBeenCalledWith(
          'claim-1',
          'evidence.pdf',
          'application/pdf',
          file.size
        );
        expect(uploadMocks.uploadToSignedUrl).toHaveBeenCalled();
        expect(uploadMocks.confirmUpload).toHaveBeenCalledWith({
          claimId: 'claim-1',
          storagePath: 'pii/tenants/t1/claims/c1/file.pdf',
          originalName: 'evidence.pdf',
          mimeType: 'application/pdf',
          fileSize: file.size,
          fileId: 'file-id',
          uploadedBucket: 'claim-evidence',
          category: 'evidence',
        });
        expect(uploadMocks.toastSuccess).toHaveBeenCalledWith(uploadSuccessText);
        expect(uploadMocks.refresh).toHaveBeenCalledTimes(1);
      });
    });

    it('falls back to the direct upload endpoint for storage-unsafe file types', async () => {
      openDialog();

      const file = new File(['dummy'], 'evidence.docx', { type: '' });
      fireEvent.change(screen.getByLabelText(fileLabel), {
        target: { files: [file] },
      });

      fireEvent.click(screen.getByRole('button', { name: uploadTriggerLabel }));

      await waitFor(() => {
        expect(uploadMocks.fetch).toHaveBeenCalledWith('/api/claims/evidence-upload', {
          method: 'POST',
          body: expect.any(FormData),
        });
        expect(uploadMocks.generateUploadUrl).not.toHaveBeenCalled();
        expect(uploadMocks.confirmUpload).not.toHaveBeenCalled();
      });

      expect(uploadMocks.refresh).toHaveBeenCalledTimes(1);
    });

    it(`keeps ${uploadUrlMockName} and ${confirmMockName} wired through the wrapper`, () => {
      expect(uploadMocks.generateUploadUrl).toBeTypeOf('function');
      expect(uploadMocks.confirmUpload).toBeTypeOf('function');
    });
  });
}
