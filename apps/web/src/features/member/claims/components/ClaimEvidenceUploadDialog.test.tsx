import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';
import { runSharedEvidenceUploadDialogTests } from '@/features/claims/components/shared-evidence-upload-dialog.test-helpers';
import en from '@/messages/en/claims.json';
import mk from '@/messages/mk/claims.json';
import sq from '@/messages/sq/claims.json';
import sr from '@/messages/sr/claims.json';

const catalogs = { en, mk, sq, sr } as const;
const localizedCopy = {
  en: {
    dialogTitle: 'Upload Evidence',
    dialogDescription: 'Attach photos or documents relevant to this case.',
    documentTypeLabel: 'Document Type',
    documentTypePlaceholder: 'Select document type',
    fileLabel: 'File',
    uploadButton: 'Upload',
    uploading: 'Uploading...',
    cancel: 'Cancel',
    uploadSuccess: 'Evidence uploaded successfully',
    uploadFailed: 'Failed to upload evidence',
    storageUnavailable: 'Storage client unavailable',
    aiExtractionConsent:
      'I agree to AI document extraction for this uploaded file to prepare claim fields for human review.',
    types: { evidence: 'Evidence', legal: 'Legal document' },
  },
  sq: {
    dialogTitle: 'Ngarko dëshmi',
    dialogDescription: 'Bashkëngjit fotografi ose dokumente që lidhen me këtë rast.',
    documentTypeLabel: 'Lloji i dokumentit',
    documentTypePlaceholder: 'Zgjidh llojin e dokumentit',
    fileLabel: 'Skedari',
    uploadButton: 'Ngarko',
    uploading: 'Duke ngarkuar...',
    cancel: 'Anulo',
    uploadSuccess: 'Dëshmia u ngarkua me sukses',
    uploadFailed: 'Ngarkimi i dëshmisë dështoi',
    storageUnavailable: 'Shërbimi i ruajtjes nuk është i disponueshëm',
    aiExtractionConsent:
      'Pranoj nxjerrjen e të dhënave nga ky dokument i ngarkuar me inteligjencë artificiale, për të përgatitur fushat e kërkesës për shqyrtim nga një person.',
    types: { evidence: 'Dëshmi', legal: 'Dokument ligjor' },
  },
  mk: {
    dialogTitle: 'Прикачи докази',
    dialogDescription: 'Приложете фотографии или документи што се однесуваат на овој случај.',
    documentTypeLabel: 'Вид на документ',
    documentTypePlaceholder: 'Изберете вид на документ',
    fileLabel: 'Датотека',
    uploadButton: 'Прикачи',
    uploading: 'Се прикачува...',
    cancel: 'Откажи',
    uploadSuccess: 'Доказот е успешно прикачен',
    uploadFailed: 'Неуспешно прикачување на доказот',
    storageUnavailable: 'Услугата за складирање не е достапна',
    aiExtractionConsent:
      'Се согласувам со извлекување податоци со вештачка интелигенција од овој прикачен документ, за да се подготват полињата на барањето за преглед од човек.',
    types: { evidence: 'Доказ', legal: 'Правен документ' },
  },
  sr: {
    dialogTitle: 'Otpremi dokaze',
    dialogDescription: 'Priložite fotografije ili dokumente koji se odnose na ovaj slučaj.',
    documentTypeLabel: 'Vrsta dokumenta',
    documentTypePlaceholder: 'Izaberite vrstu dokumenta',
    fileLabel: 'Fajl',
    uploadButton: 'Otpremi',
    uploading: 'Otpremanje...',
    cancel: 'Otkaži',
    uploadSuccess: 'Dokaz je uspešno otpremljen',
    uploadFailed: 'Otpremanje dokaza nije uspelo',
    storageUnavailable: 'Usluga skladištenja nije dostupna',
    aiExtractionConsent:
      'Pristajem na izdvajanje podataka iz ovog otpremljenog dokumenta pomoću veštačke inteligencije, radi pripreme polja zahteva za ljudski pregled.',
    types: { evidence: 'Dokaz', legal: 'Pravni dokument' },
  },
} as const;

type SupportedLocale = keyof typeof localizedCopy;

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

function dialogElement(locale: SupportedLocale = 'mk', triggerLabel = 'Open') {
  mocks.locale = locale;
  mocks.messages = catalogs[locale] as Record<string, unknown>;
  return (
    <ClaimEvidenceUploadDialog
      claimId="claim-1"
      trigger={<button type="button">{triggerLabel}</button>}
    />
  );
}

function renderDialog(locale: SupportedLocale = 'mk', triggerLabel = 'Open') {
  return render(dialogElement(locale, triggerLabel));
}

function openDialog(locale: SupportedLocale = 'mk', triggerLabel = 'Open') {
  renderDialog(locale, triggerLabel);
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

  it.each(Object.keys(localizedCopy) as SupportedLocale[])(
    'renders every wrapper-owned message from the %s catalog without English fallback',
    locale => {
      const copy = localizedCopy[locale];
      const catalogCopy = (
        catalogs[locale] as unknown as {
          claims: { detail: { evidenceUpload?: unknown } };
        }
      ).claims.detail.evidenceUpload;

      expect(catalogCopy).toEqual(copy);
      renderDialog(locale);

      fireEvent.click(screen.getByRole('button', { name: 'Open' }));

      expect(screen.getByRole('dialog', { name: copy.dialogTitle })).toBeVisible();
      expect(screen.getByText(copy.dialogDescription)).toBeVisible();
      expect(screen.getByText(copy.documentTypeLabel)).toBeVisible();
      expect(screen.getByLabelText(copy.fileLabel)).toBeVisible();
      expect(screen.getByRole('button', { name: copy.uploadButton })).toBeVisible();
      expect(screen.getByRole('button', { name: copy.cancel })).toBeVisible();
      expect(screen.getByLabelText(copy.aiExtractionConsent)).not.toBeChecked();

      if (locale !== 'en') {
        expect(screen.queryByRole('dialog', { name: localizedCopy.en.dialogTitle })).toBeNull();
        expect(screen.queryByText(localizedCopy.en.dialogDescription)).toBeNull();
      }
    }
  );

  it('sends explicit member opt-in through signed upload confirmation', async () => {
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

  it('does not carry opt-in across selected files', async () => {
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

  it('submits canonical locale, category, and consent fields through direct upload', async () => {
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

  it('resets the selected file and consent after cancel and returns focus to the trigger', () => {
    openDialog('sq', 'Ngarko provë');
    const fileInput = screen.getByLabelText(localizedCopy.sq.fileLabel);
    fireEvent.change(fileInput, {
      target: { files: [new File(['one'], 'one.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText(localizedCopy.sq.aiExtractionConsent));
    fireEvent.click(screen.getByRole('button', { name: localizedCopy.sq.cancel }));

    expect(screen.getByRole('button', { name: 'Ngarko provë' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Ngarko provë' }));
    expect(screen.getByLabelText(localizedCopy.sq.aiExtractionConsent)).not.toBeChecked();
    expect(screen.getByLabelText(localizedCopy.sq.fileLabel)).toHaveValue('');
  });

  it('keeps provider errors verbatim and uses the localized fallback for unknown failures', async () => {
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

  it('passes server errors through and renders localized pending state', async () => {
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
