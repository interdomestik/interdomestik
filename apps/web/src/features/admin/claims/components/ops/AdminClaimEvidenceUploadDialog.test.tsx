import { vi } from 'vitest';
import { AdminClaimEvidenceUploadDialog } from './AdminClaimEvidenceUploadDialog';
import { runSharedEvidenceUploadDialogTests } from '@/features/claims/components/shared-evidence-upload-dialog.test-helpers';

const mocks = vi.hoisted(() => ({
  generateAdminUploadUrl: vi.fn(),
  confirmAdminUpload: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  fetch: vi.fn(),
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
  usePathname: () => '/mk/admin/claims/claim-1',
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

runSharedEvidenceUploadDialogTests({
  dialogName: 'AdminClaimEvidenceUploadDialog',
  fileLabel: 'File',
  openButtonLabel: 'Open upload',
  renderDialog: () => (
    <AdminClaimEvidenceUploadDialog
      claimId="claim-1"
      trigger={<button type="button">Open upload</button>}
    />
  ),
  uploadMocks: {
    confirmUpload: mocks.confirmAdminUpload,
    fetch: mocks.fetch,
    generateUploadUrl: mocks.generateAdminUploadUrl,
    refresh: mocks.refresh,
    toastError: mocks.toastError,
    toastSuccess: mocks.toastSuccess,
    uploadToSignedUrl: mocks.uploadToSignedUrl,
  },
  uploadSuccessText: 'Evidence uploaded successfully',
  uploadTriggerLabel: 'Upload',
  uploadUrlMockName: 'generateAdminUploadUrl',
  confirmMockName: 'confirmAdminUpload',
});
