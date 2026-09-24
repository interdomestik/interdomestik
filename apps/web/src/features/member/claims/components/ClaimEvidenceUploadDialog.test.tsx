import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';
import { runSharedEvidenceUploadDialogTests } from '@/features/claims/components/shared-evidence-upload-dialog.test-helpers';
import {
  catalogs,
  commonCatalogs,
  exactCopy,
  localizedCopy,
  type SupportedLocale,
} from './claim-evidence-upload-dialog-copy.fixture';

const mocks = vi.hoisted(() => ({
  generateUploadUrl: vi.fn(),
  confirmUpload: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  uploadToSignedUrl: vi.fn(),
  fetch: vi.fn(),
  locale: 'mk',
  messages: {} as Record<string, unknown>,
}));

function dialogElement(
  locale: SupportedLocale = 'mk',
  triggerLabel = 'Open',
  informationRequestId?: string
) {
  mocks.locale = locale;
  mocks.messages = { ...catalogs[locale], ...commonCatalogs[locale] } as Record<string, unknown>;
  return (
    <ClaimEvidenceUploadDialog
      claimId="claim-1"
      informationRequestId={informationRequestId}
      trigger={<button type="button">{triggerLabel}</button>}
    />
  );
}

function openDialog(locale: SupportedLocale = 'mk', triggerLabel = 'Open') {
  render(dialogElement(locale, triggerLabel));
  fireEvent.click(screen.getByRole('button', { name: triggerLabel }));
}

function selectCategory(label: string) {
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

vi.mock('@/features/member/claims/actions', () => ({
  generateUploadUrl: mocks.generateUploadUrl,
  confirmUpload: mocks.confirmUpload,
}));

vi.mock('next-intl', () => ({
  useLocale: () => mocks.locale,
  useTranslations: (namespace: string) => (key: string) => {
    const path = `${namespace}.${key}`.split('.');
    const value = path.reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, mocks.messages);
    return typeof value === 'string' ? value : `${namespace}.${key}`;
  },
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
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, fileId: 'direct-file-id' }),
    });
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(Object.keys(catalogs) as SupportedLocale[])(
    'renders exact %s copy without English fallback',
    locale => {
      const c = localizedCopy[locale];
      const values = [...Object.values(c).slice(0, -1), c.types.evidence, c.types.legal].join('|');
      expect(createHash('sha256').update(values).digest('hex')).toBe(exactCopy[locale]);
      openDialog(locale);
      expect(screen.getByRole('dialog', { name: c.dialogTitle })).toBeVisible();
      expect(screen.getByText(c.dialogDescription)).toBeVisible();
      expect(screen.getByText(c.documentTypeLabel)).toBeVisible();
      expect(screen.getByLabelText(c.fileLabel)).toBeVisible();
      expect(screen.getByRole('button', { name: c.uploadButton })).toBeVisible();
      expect(screen.getByRole('button', { name: c.cancel })).toBeVisible();
      expect(screen.getByLabelText(c.aiExtractionConsent)).not.toBeChecked();
      if (locale !== 'en')
        expect(screen.queryByText(localizedCopy.en.dialogDescription)).toBeNull();
    }
  );

  it('sends signed opt-in fields', async () => {
    openDialog();
    selectCategory(localizedCopy.mk.types.legal);
    fireEvent.change(screen.getByLabelText(localizedCopy.mk.fileLabel), {
      target: { files: [new File(['dummy'], 'evidence.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText(localizedCopy.mk.aiExtractionConsent));
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.mk.uploadButton }));

    await waitFor(() => {
      expect(mocks.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          aiExtractionConsentGranted: true,
          aiExtractionConsentLocale: 'mk',
          category: 'legal',
        })
      );
    });
  });

  it('resets consent on file change', async () => {
    openDialog();
    const fileInput = screen.getByLabelText(localizedCopy.mk.fileLabel);
    fireEvent.change(fileInput, {
      target: { files: [new File(['one'], 'one.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText(localizedCopy.mk.aiExtractionConsent));
    fireEvent.change(fileInput, {
      target: { files: [new File(['two'], 'two.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.mk.uploadButton }));

    await waitFor(() => {
      expect(mocks.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({ aiExtractionConsentGranted: false })
      );
    });
  });

  it('submits canonical direct-upload fields', async () => {
    openDialog('sr');
    selectCategory(localizedCopy.sr.types.legal);
    const file = new File(['dummy'], 'evidence.docx', { type: '' });
    fireEvent.change(screen.getByLabelText(localizedCopy.sr.fileLabel), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByLabelText(localizedCopy.sr.aiExtractionConsent));
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.sr.uploadButton }));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const request = mocks.fetch.mock.calls[0]?.[1] as { body: FormData };
    expect(Object.fromEntries(request.body.entries())).toEqual({
      aiExtractionConsentGranted: 'true',
      category: 'legal',
      claimId: 'claim-1',
      file,
      locale: 'sr',
    });
  });

  it('keeps request-linked files above the server body limit on the signed upload path', async () => {
    render(dialogElement('en', 'Upload requested', '12345678-1234-4234-8234-123456789012'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload requested' }));
    const file = new File(['dummy'], 'evidence.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(localizedCopy.en.fileLabel), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.en.uploadButton }));

    await waitFor(() => {
      expect(mocks.generateUploadUrl).toHaveBeenCalledWith(
        'claim-1',
        'evidence.pdf',
        'application/pdf',
        file.size,
        '12345678-1234-4234-8234-123456789012',
        'application/pdf'
      );
      expect(mocks.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          informationRequestId: '12345678-1234-4234-8234-123456789012',
        })
      );
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('resets file and consent on cancel, then returns focus', async () => {
    openDialog('sq', 'Ngarko provë');
    const fileInput = screen.getByLabelText(localizedCopy.sq.fileLabel);
    fireEvent.change(fileInput, {
      target: { files: [new File(['one'], 'one.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText(localizedCopy.sq.aiExtractionConsent));
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.sq.cancel }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ngarko provë' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Ngarko provë' }));
    expect(screen.getByLabelText(localizedCopy.sq.aiExtractionConsent)).not.toBeChecked();
    expect(screen.getByLabelText(localizedCopy.sq.fileLabel)).toHaveValue('');
  });

  it('keeps provider errors and localizes unknown failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openDialog('sq');
    fireEvent.change(screen.getByLabelText(localizedCopy.sq.fileLabel), {
      target: { files: [new File(['one'], 'one.pdf', { type: 'application/pdf' })] },
    });
    mocks.uploadToSignedUrl.mockResolvedValueOnce({ error: { message: 'Provider is offline' } });
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.sq.uploadButton }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Provider is offline'));

    mocks.toastError.mockClear();
    mocks.uploadToSignedUrl.mockRejectedValueOnce({ reason: 'opaque' });
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.sq.uploadButton }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(localizedCopy.sq.uploadFailed)
    );
  });

  it('passes server errors and renders localized pending state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let resolveResponse: ((value: unknown) => void) | undefined;
    mocks.fetch.mockReturnValueOnce(new Promise(resolve => (resolveResponse = resolve)));
    openDialog('en');
    fireEvent.change(screen.getByLabelText(localizedCopy.en.fileLabel), {
      target: { files: [new File(['one'], 'one.docx', { type: '' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.en.uploadButton }));
    expect(screen.getByRole('button', { name: localizedCopy.en.uploading })).toBeDisabled();
    expect(screen.getByRole('button', { name: localizedCopy.en.cancel })).toBeDisabled();

    resolveResponse?.({ ok: false, json: async () => ({ error: 'Server rejected fixture' }) });
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Server rejected fixture'));
  });
});

runSharedEvidenceUploadDialogTests({
  dialogName: 'ClaimEvidenceUploadDialog',
  fileLabel: localizedCopy.mk.fileLabel,
  openButtonLabel: 'Open',
  renderDialog: () => dialogElement('mk'),
  uploadMocks: {
    confirmUpload: mocks.confirmUpload,
    fetch: mocks.fetch,
    generateUploadUrl: mocks.generateUploadUrl,
    refresh: mocks.refresh,
    toastError: mocks.toastError,
    toastSuccess: mocks.toastSuccess,
    uploadToSignedUrl: mocks.uploadToSignedUrl,
  },
  uploadSuccessText: localizedCopy.mk.uploadSuccess,
  uploadTriggerLabel: localizedCopy.mk.uploadButton,
  uploadUrlMockName: 'generateUploadUrl',
  confirmMockName: 'confirmUpload',
});
