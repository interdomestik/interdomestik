import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  parsePdf: vi.fn(),
}));

vi.mock('pdf-parse', () => ({ default: mocks.parsePdf }));

import { analyzeClaimDocumentAsText } from './claim-document-text';

describe('analyzeClaimDocumentAsText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('decodes plain text without invoking the PDF parser', async () => {
    await expect(
      analyzeClaimDocumentAsText(Buffer.from('Claim evidence'), 'text/plain')
    ).resolves.toBe('Claim evidence');
    expect(mocks.parsePdf).not.toHaveBeenCalled();
  });

  it('returns parsed PDF text', async () => {
    const buffer = Buffer.from('pdf-bytes');
    mocks.parsePdf.mockResolvedValue({ text: 'Parsed evidence' });

    await expect(analyzeClaimDocumentAsText(buffer, 'application/pdf')).resolves.toBe(
      'Parsed evidence'
    );
    expect(mocks.parsePdf).toHaveBeenCalledWith(buffer);
  });

  it('preserves empty PDF text', async () => {
    mocks.parsePdf.mockResolvedValue({});

    await expect(
      analyzeClaimDocumentAsText(Buffer.from('pdf-bytes'), 'application/pdf')
    ).resolves.toBe('');
  });

  it('preserves PDF parser failures', async () => {
    const failure = new Error('PDF parse failed.');
    mocks.parsePdf.mockRejectedValue(failure);

    await expect(
      analyzeClaimDocumentAsText(Buffer.from('pdf-bytes'), 'application/pdf')
    ).rejects.toBe(failure);
  });

  it.each([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/m4a',
    'audio/wav',
    'application/octet-stream',
  ])('fails closed for unsupported MIME type %s', async mimeType => {
    await expect(analyzeClaimDocumentAsText(Buffer.from('binary'), mimeType)).rejects.toMatchObject(
      {
        name: 'ExtractionPipelineError',
        errorCode: 'claim_ai_unsupported_document_type',
      }
    );
    expect(mocks.parsePdf).not.toHaveBeenCalled();
  });
});
