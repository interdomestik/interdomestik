import en from '@/messages/en/evidence.json';
import sq from '@/messages/sq/evidence.json';
import sr from '@/messages/sr/evidence.json';
import mk from '@/messages/mk/evidence.json';
import de from '@/messages/de/evidence.json';
import { evidenceUploadErrorMessage } from '@/features/claims/upload/evidence-upload-error';

const catalogs = { en, sq, sr, mk, de };

export function uploadErrorResponse(
  code: string,
  status: number,
  locale: string,
  limitMB = 4
): Response {
  const catalog = catalogs[locale as keyof typeof catalogs] ?? catalogs.en;
  const error = evidenceUploadErrorMessage(
    code,
    (key, values) => {
      let message: string = catalog.evidence.fileUpload[key];
      for (const [name, value] of Object.entries(values ?? {}))
        message = message.replace(`{${name}}`, String(value));
      return message;
    },
    limitMB
  );
  return Response.json({ error }, { status });
}
