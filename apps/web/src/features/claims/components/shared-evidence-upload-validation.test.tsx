import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedEvidenceUploadDialog } from './SharedEvidenceUploadDialog';
import { EVIDENCE_FILE_ACCEPT, EVIDENCE_FORMAT_LABEL } from '../upload/evidence-file-policy';
import en from '@/messages/en/evidence.json';
import sq from '@/messages/sq/evidence.json';
import sr from '@/messages/sr/evidence.json';
import mk from '@/messages/mk/evidence.json';
import de from '@/messages/de/evidence.json';

const m = vi.hoisted(() => ({
  sign: vi.fn(),
  confirm: vi.fn(),
  transfer: vi.fn(),
  error: vi.fn(),
}));
vi.unmock('next-intl');
vi.mock('@interdomestik/database/client', () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: m.transfer }) } }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/member/claims/claim-1',
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: m.error } }));

const catalogs = { en, sq, sr, mk, de };
type Locale = keyof typeof catalogs;
const MB = 1024 * 1024;
function open(locale: Locale = 'en'): void {
  render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      <SharedEvidenceUploadDialog
        claimId="claim-1"
        locale={locale}
        categoryFieldId="category"
        fileFieldId="file"
        generateUploadUrl={m.sign}
        confirmUpload={m.confirm}
        trigger={<button>Open</button>}
        messages={{
          dialogTitle: 'Evidence',
          dialogDescription: 'Attach evidence',
          documentTypeLabel: 'Type',
          documentTypePlaceholder: 'Type',
          fileLabel: 'File',
          uploadButton: 'Upload',
          uploading: 'Uploading',
          cancel: 'Cancel',
          uploadSuccess: 'Done',
          uploadFailed: 'Unused fallback',
          storageUnavailable: 'Unavailable',
          types: { evidence: 'Evidence', legal: 'Legal' },
        }}
      />
    </NextIntlClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
}
function choose(name: string, size: number, type = ''): File {
  const file = new File(['bytes'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(screen.getByLabelText('File'), { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  m.sign.mockResolvedValue({
    success: true,
    bucket: 'claim-evidence',
    path: 'signed/path',
    token: 'token',
    intentToken: 'intent',
    id: 'file-1',
  });
  m.transfer.mockResolvedValue({ error: null });
  m.confirm.mockResolvedValue({ success: true });
});

describe('shared member/admin evidence validation and localized errors', () => {
  it.each(Object.entries(catalogs))(
    'shows the approved help and accept list in %s',
    (locale, catalog) => {
      open(locale as Locale);
      expect(screen.getByLabelText('File')).toHaveAttribute('accept', EVIDENCE_FILE_ACCEPT);
      expect(
        screen.getByText(
          catalog.evidence.fileUpload.help.replace('{formats}', EVIDENCE_FORMAT_LABEL)
        )
      ).toBeVisible();
    }
  );

  it.each(Object.entries(catalogs))(
    'names the dialog close button in %s (qa3 #69)',
    (locale, catalog) => {
      open(locale as Locale);
      expect(
        screen.getByRole('button', { name: catalog.evidence.fileUpload.close })
      ).toBeInTheDocument();
      if (locale !== 'en') expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    }
  );

  it.each(Object.entries(catalogs))(
    'refuses invalid files before signing or transfer in %s',
    (locale, catalog) => {
      open(locale as Locale);
      for (const ext of [
        'txt',
        'csv',
        'json',
        'xml',
        'zip',
        'gif',
        'bmp',
        'tiff',
        'eml',
        'msg',
        'avi',
        'webm',
        'odt',
        'rtf',
        'pptx',
      ]) {
        choose(`file.${ext}`, 100);
        expect(m.error).toHaveBeenLastCalledWith(
          catalog.evidence.fileUpload.unsupported.replace('{formats}', EVIDENCE_FORMAT_LABEL)
        );
      }
      choose('empty.pdf', 0);
      expect(m.error).toHaveBeenLastCalledWith(catalog.evidence.fileUpload.empty);
      for (const [ext, limit] of [
        ['pdf', 10],
        ['png', 10],
        ['mp3', 10],
        ['mp4', 50],
        ['mov', 50],
      ] as const) {
        choose(`large.${ext}`, limit * MB + 1);
        expect(m.error).toHaveBeenLastCalledWith(
          catalog.evidence.fileUpload.tooLarge.replace('{limit}', String(limit))
        );
      }
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      expect(m.sign).not.toHaveBeenCalled();
      expect(m.transfer).not.toHaveBeenCalled();
      expect(m.confirm).not.toHaveBeenCalled();
    }
  );

  it.each([
    'pdf',
    'jpg',
    'jpeg',
    'jfif',
    'png',
    'heic',
    'heif',
    'webp',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'mp3',
    'm4a',
    'wav',
    'mp4',
    'mov',
  ])('sends .%s directly to signed storage with canonical MIME', async ext => {
    open();
    // Include files larger than the function-body limit and browser MIME mislabelling.
    choose(`file.${ext}`, 6 * MB, 'application/octet-stream');
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(m.confirm).toHaveBeenCalledOnce());
    const mime = m.sign.mock.calls[0][2];
    expect(m.transfer).toHaveBeenCalledWith(
      'signed/path',
      'token',
      expect.objectContaining({ type: mime }),
      expect.objectContaining({ contentType: mime, upsert: false })
    );
    expect(mime).not.toBe('text/plain');
    expect(m.error).not.toHaveBeenCalled();
  });

  it.each(Object.entries(catalogs))(
    'localizes confirmation errors and permits file correction in %s',
    async (locale, catalog) => {
      open(locale as Locale);
      choose('spoof.pdf', 100);
      m.confirm.mockResolvedValueOnce({
        success: false,
        error: 'evidence_content_mismatch',
        status: 409,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await waitFor(() =>
        expect(m.error).toHaveBeenCalledWith(catalog.evidence.fileUpload.contentMismatch)
      );
      expect(screen.getByLabelText('File')).toBeEnabled();
      choose('valid.pdf', 100);
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await waitFor(() => expect(m.sign).toHaveBeenCalledTimes(2));
    }
  );

  it.each(Object.entries(catalogs))(
    'hides raw server and storage errors in %s',
    async (locale, catalog) => {
      open(locale as Locale);
      choose('file.pdf', 100);
      m.sign.mockResolvedValueOnce({
        success: false,
        error: 'Invalid file size: internal English',
      });
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await waitFor(() =>
        expect(m.error).toHaveBeenLastCalledWith(catalog.evidence.fileUpload.failed)
      );
      m.transfer.mockResolvedValueOnce({
        error: { message: 'mime type image/webp is not supported' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
      await waitFor(() => expect(m.error).toHaveBeenCalledTimes(2));
      expect(m.error).toHaveBeenLastCalledWith(catalog.evidence.fileUpload.failed);
      expect(m.confirm).not.toHaveBeenCalled();
    }
  );
});

it('preserves a status-only duplicate from storage and confirms the same create-only target', async () => {
  open();
  choose('proof.pdf', 100);
  m.transfer.mockResolvedValueOnce({ error: { statusCode: '409' } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
  await waitFor(() => expect(m.confirm).toHaveBeenCalledOnce());
  expect(m.transfer).toHaveBeenCalledWith(
    'signed/path',
    'token',
    expect.any(File),
    expect.objectContaining({ upsert: false })
  );
  expect(m.confirm).toHaveBeenCalledWith(expect.objectContaining({ storagePath: 'signed/path' }));
  expect(m.error).not.toHaveBeenCalled();
});
