import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignedUploadIdentityChangedError } from './use-signed-upload-retry';
import { SharedEvidenceUploadDialog } from './SharedEvidenceUploadDialog';

const mocks = vi.hoisted(() => ({
  confirmUpload: vi.fn(),
  generateUploadUrl: vi.fn(),
  onUploadSuccess: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock('@interdomestik/database/client', () => ({
  createClient: () => ({
    storage: { from: () => ({ uploadToSignedUrl: mocks.uploadToSignedUrl }) },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  usePathname: () => '/en/member/claims/claim-1',
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

const TARGET = {
  success: true,
  bucket: 'claim-evidence',
  path: 'pii/tenants/t1/claims/claim-1/file-id.pdf',
  token: 'signed-token',
  intentToken: 'intent-1',
  id: 'file-id',
};
const ORIGINAL_PAYLOAD = expect.objectContaining({
  aiExtractionConsentGranted: true,
  category: 'legal',
  fileId: 'file-id',
  originalName: 'evidence.pdf',
  storagePath: TARGET.path,
  uploadIntentToken: 'intent-1',
  uploadedBucket: 'claim-evidence',
});
const messages = {
  dialogTitle: 'Upload evidence',
  dialogDescription: 'Attach a document',
  documentTypeLabel: 'Document type',
  documentTypePlaceholder: 'Select type',
  fileLabel: 'File',
  uploadButton: 'Upload',
  uploading: 'Uploading',
  cancel: 'Cancel',
  uploadSuccess: 'Uploaded',
  uploadFailed: 'Upload failed',
  storageUnavailable: 'Storage unavailable',
  aiExtractionConsent: 'Allow AI extraction',
  types: { evidence: 'Evidence', legal: 'Legal' },
};

function openDialog() {
  render(
    <SharedEvidenceUploadDialog
      categoryFieldId="category"
      claimId="claim-1"
      confirmUpload={mocks.confirmUpload}
      fileFieldId="file"
      generateUploadUrl={mocks.generateUploadUrl}
      locale="en"
      messages={messages}
      onUploadSuccess={mocks.onUploadSuccess}
      trigger={<button type="button">Open</button>}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
}

function prepareDraft() {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: 'Legal' }));
  fireEvent.change(screen.getByLabelText('File'), {
    target: { files: [new File(['pdf'], 'evidence.pdf', { type: 'application/pdf' })] },
  });
  fireEvent.click(screen.getByLabelText('Allow AI extraction'));
}

const clickUpload = () => fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

function expectOriginalDraftLocked() {
  expect(screen.getByLabelText('File')).toBeDisabled();
  expect(screen.getByLabelText('Allow AI extraction')).toBeChecked();
  expect(screen.getByLabelText('Allow AI extraction')).toBeDisabled();
  expect(screen.getByRole('combobox')).toHaveTextContent('Legal');
  expect(screen.getByRole('combobox')).toBeDisabled();
}

function expectSameConfirmations(count: number) {
  expect(mocks.confirmUpload).toHaveBeenCalledTimes(count);
  for (const [payload] of mocks.confirmUpload.mock.calls) expect(payload).toEqual(ORIGINAL_PAYLOAD);
  expect(mocks.generateUploadUrl).toHaveBeenCalledTimes(1);
  expect(mocks.uploadToSignedUrl).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.generateUploadUrl.mockResolvedValue(TARGET);
  mocks.uploadToSignedUrl.mockResolvedValue({ error: null });
  mocks.confirmUpload.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SharedEvidenceUploadDialog uncertain confirmation retry', () => {
  it('replays the original confirmation after a thrown response without a new intent', async () => {
    mocks.confirmUpload.mockRejectedValueOnce(new Error('Network response lost'));
    openDialog();
    prepareDraft();

    clickUpload();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Network response lost'));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.onUploadSuccess).not.toHaveBeenCalled();
    expectOriginalDraftLocked();

    clickUpload();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expectSameConfirmations(2);
    expect(mocks.confirmUpload.mock.calls[1]?.[0]).toBe(mocks.confirmUpload.mock.calls[0]?.[0]);
    expect(mocks.onUploadSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'file-id', documentName: 'evidence.pdf' })
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Uploaded');
  });

  it('localizes identity-change recovery without claiming a saved upload', async () => {
    mocks.confirmUpload.mockRejectedValueOnce(new SignedUploadIdentityChangedError());
    openDialog();
    prepareDraft();
    clickUpload();
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('uploadRecovery.identityChanged')
    );
    expect(screen.getByTestId('upload-recovery')).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('offers the original-page recovery after a direct response is lost without claiming deduplication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Response lost')));
    openDialog();
    fireEvent.change(screen.getByLabelText('File'), {
      target: { files: [new File(['image'], 'evidence.heic', { type: 'image/heic' })] },
    });
    clickUpload();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Response lost'));
    expect(screen.getByRole('link', { name: 'uploadRecovery.action' })).toHaveAttribute(
      'href',
      '/en/member/claims/claim-1'
    );
    expect(mocks.generateUploadUrl).not.toHaveBeenCalled();
    expect(mocks.confirmUpload).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('admits a single intent, transfer, and confirm for rapid clicks while pending', async () => {
    let settle: ((value: { success: true }) => void) | undefined;
    mocks.confirmUpload.mockReturnValueOnce(
      new Promise<{ success: true }>(resolve => {
        settle = resolve;
      })
    );
    openDialog();
    prepareDraft();
    const button = screen.getByRole('button', { name: 'Upload' });

    // Both clicks dispatch inside one act scope, before React commits the disabled button.
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Uploading' }));
    await waitFor(() => expect(mocks.confirmUpload).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    await act(async () => settle?.({ success: true }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expectSameConfirmations(1);
  });

  it('keeps the pending confirmation across dismissal and reopen', async () => {
    mocks.confirmUpload.mockRejectedValueOnce(new Error('Network response lost'));
    openDialog();
    prepareDraft();
    clickUpload();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('evidence.pdf')).toBeVisible();
    expectOriginalDraftLocked();

    clickUpload();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expectSameConfirmations(2);
  });

  it('never confirms a failed transfer and retries the original storage target', async () => {
    mocks.uploadToSignedUrl.mockResolvedValueOnce({ error: { message: 'Storage offline' } });
    openDialog();
    prepareDraft();

    clickUpload();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Storage offline'));
    expect(mocks.confirmUpload).not.toHaveBeenCalled();
    expectOriginalDraftLocked();

    clickUpload();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.generateUploadUrl).toHaveBeenCalledTimes(1);
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledTimes(2);
    expect(mocks.uploadToSignedUrl.mock.calls[1]).toEqual(mocks.uploadToSignedUrl.mock.calls[0]);
    expect(mocks.confirmUpload).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expired', 'Upload confirmation expired. Please retry upload.'],
    ['denied', 'Unauthorized'],
  ])('keeps the original identity and fails closed when the retry is %s', async (_label, error) => {
    mocks.confirmUpload
      .mockRejectedValueOnce(new Error('Network response lost'))
      .mockResolvedValue({ success: false, error });
    openDialog();
    prepareDraft();

    clickUpload();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    clickUpload();
    await waitFor(() => expect(mocks.toastError).toHaveBeenLastCalledWith(error));
    clickUpload();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(3));

    const recovery = within(screen.getByTestId('upload-recovery'));
    expect(recovery.getByText('uploadRecovery.description')).toBeVisible();
    expect(recovery.getByRole('link', { name: 'uploadRecovery.action' })).toHaveAttribute(
      'href',
      '/en/member/claims/claim-1'
    );
    expectSameConfirmations(3);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.onUploadSuccess).not.toHaveBeenCalled();
    expectOriginalDraftLocked();
  });
});
