import { describe, expect, it, vi } from 'vitest';
import { parseEvidenceUploadForm } from './parse-evidence-upload-form';
import en from '@/messages/en/evidence.json';
import sq from '@/messages/sq/evidence.json';
import sr from '@/messages/sr/evidence.json';
import mk from '@/messages/mk/evidence.json';
import de from '@/messages/de/evidence.json';

const catalogs = { en, sq, sr, mk, de };
function request(file: File, locale = 'en'): Request {
  const data = new FormData();
  for (const [key, value] of Object.entries({ claimId: 'claim-1', category: 'evidence', locale }))
    data.set(key, value);
  data.set('file', file);
  return { formData: async () => data } as Request;
}
const MB = 1024 * 1024;

describe('legacy multipart evidence validation', () => {
  it.each(Object.entries(catalogs))(
    'caps %s uploads at 4 MB with localized copy',
    async (locale, catalog) => {
      const result = await parseEvidenceUploadForm(
        request(new File([new Uint8Array(4 * MB + 1)], 'video.mp4', { type: 'video/mp4' }), locale)
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.response.status).toBe(413);
      expect(await result.response.json()).toMatchObject({
        error: catalog.evidence.fileUpload.tooLarge.replace('{limit}', '4'),
      });
    }
  );

  it('allows exactly 4 MB and uses the same allowlist', async () => {
    expect(
      (await parseEvidenceUploadForm(request(new File([new Uint8Array(4 * MB)], 'evidence.pdf'))))
        .success
    ).toBe(true);
    for (const file of [new File(['text'], 'evidence.txt'), new File([], 'evidence.pdf')]) {
      const result = await parseEvidenceUploadForm(request(file));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.response.status).toBe(400);
    }
  });

  it('rejects declared oversize bodies before parsing multipart data', async () => {
    const formData = vi.fn();
    const result = await parseEvidenceUploadForm({
      headers: new Headers({ 'content-length': String(4.5 * MB) }),
      formData,
    } as unknown as Request);
    expect(result.success).toBe(false);
    expect(formData).not.toHaveBeenCalled();
  });
});
