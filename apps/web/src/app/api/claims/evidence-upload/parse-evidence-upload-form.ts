import { LOCALES } from '@/i18n/locales';
import { z } from 'zod';
import { validateEvidenceFile } from '@/features/claims/upload/evidence-file-policy';
import { uploadErrorResponse } from './upload-error-response';
import { MAX_DIRECT_FILE_BYTES, readUploadForm } from './read-upload-form';

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

function invalidForm(): ParseResult {
  return {
    success: false,
    response: Response.json({ error: 'Invalid form payload' }, { status: 400 }),
  };
}

export async function parseEvidenceUploadForm(request: Request): Promise<ParseResult> {
  const formData = await readUploadForm(request);
  if (formData === 'too-large') {
    const language = request.headers?.get('accept-language')?.split(/[-,;]/)[0] ?? 'en';
    return { success: false, response: uploadErrorResponse('evidence_too_large', 413, language) };
  }
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
    (informationRequestId && !informationRequestId.success)
  ) {
    return invalidForm();
  }

  if (file.size > MAX_DIRECT_FILE_BYTES) {
    return { success: false, response: uploadErrorResponse('evidence_too_large', 413, locale) };
  }
  const validation = validateEvidenceFile(file.name, file.size, file.type);
  if (!validation.success) {
    return { success: false, response: uploadErrorResponse(validation.error, 400, locale) };
  }

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
