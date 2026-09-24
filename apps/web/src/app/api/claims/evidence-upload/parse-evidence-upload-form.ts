import { LOCALES } from '@/i18n/locales';
import { z } from 'zod';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export type UploadCategory = 'evidence' | 'legal';
export type EvidenceUploadForm = {
  aiExtractionConsentGranted: boolean;
  category: UploadCategory;
  claimId: string;
  file: File;
  informationRequestId?: string;
  locale: string;
};

type ParseResult =
  { success: true; data: EvidenceUploadForm } | { success: false; response: Response };

function invalidForm(status = 400): ParseResult {
  return {
    success: false,
    response: Response.json(
      { error: status === 413 ? 'File too large (max 50MB)' : 'Invalid form payload' },
      { status }
    ),
  };
}

export async function parseEvidenceUploadForm(request: Request): Promise<ParseResult> {
  const formData = await request.formData().catch(() => null);
  if (!formData) return invalidForm();

  const claimId = formData.get('claimId');
  const category = formData.get('category');
  const locale = formData.get('locale');
  const aiExtractionConsentGranted = formData.get('aiExtractionConsentGranted');
  const file = formData.get('file');
  const rawInformationRequestId = formData.get('informationRequestId');
  const informationRequestId =
    typeof rawInformationRequestId === 'string' && rawInformationRequestId
      ? z.uuid().safeParse(rawInformationRequestId)
      : null;

  if (
    typeof claimId !== 'string' ||
    (category !== 'evidence' && category !== 'legal') ||
    typeof locale !== 'string' ||
    !LOCALES.includes(locale as (typeof LOCALES)[number]) ||
    !(file instanceof File) ||
    (informationRequestId && !informationRequestId.success) ||
    file.size <= 0
  ) {
    return invalidForm();
  }

  if (file.size > MAX_FILE_SIZE_BYTES) return invalidForm(413);

  return {
    success: true,
    data: {
      aiExtractionConsentGranted: aiExtractionConsentGranted === 'true',
      category,
      claimId,
      file,
      informationRequestId: informationRequestId?.data,
      locale,
    },
  };
}
