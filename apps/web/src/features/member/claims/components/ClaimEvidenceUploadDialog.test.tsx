import { vi } from 'vitest';
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
