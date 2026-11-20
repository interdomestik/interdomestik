// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MAX_DIRECT_FILE_BYTES, readUploadForm } from './read-upload-form';
import { parseEvidenceUploadForm } from './parse-evidence-upload-form';

describe('bounded legacy multipart body reader', () => {
  it('parses a real multipart request', async () => {
    const data = new FormData();
    data.set('claimId', 'claim-1');
    data.set('category', 'evidence');
    data.set('locale', 'de');
    data.set('file', new File(['%PDF-1.7'], 'evidence.pdf', { type: 'application/pdf' }));
    const result = await parseEvidenceUploadForm(
      new Request('https://example.test/upload', { method: 'POST', body: data })
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.file.name).toBe('evidence.pdf');
  });

  it('accepts the one-door gate email as multipart evidence', async () => {
    const data = new FormData();
    data.set('claimId', 'claim-1');
    data.set('category', 'evidence');
    data.set('locale', 'en');
    data.set(
      'file',
      new File(
        ['From: synthetic@example.invalid\r\nSubject: One door\r\n\r\nSynthetic evidence.\r\n'],
        'door.eml',
        { type: 'message/rfc822' }
      )
    );
    const result = await parseEvidenceUploadForm(
      new Request('https://example.test/api/claims/evidence-upload', { method: 'POST', body: data })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.file).toMatchObject({ name: 'door.eml', type: 'message/rfc822' });
    }
  });

  it('stops chunked bodies at the limit even without Content-Length', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_DIRECT_FILE_BYTES));
        controller.enqueue(new Uint8Array(128 * 1024));
      },
      cancel,
    });
    const request = { body: stream, headers: new Headers() } as Request;
    expect(await readUploadForm(request)).toBe('too-large');
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('refuses a falsely small Content-Length when streamed bytes exceed the limit', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_DIRECT_FILE_BYTES + 128 * 1024));
        controller.close();
      },
    });
    expect(
      await readUploadForm({ body, headers: new Headers({ 'content-length': '1' }) } as Request)
    ).toBe('too-large');
  });

  it('refuses malformed multipart bodies', async () => {
    expect(
      await readUploadForm(
        new Request('https://example.test/upload', {
          method: 'POST',
          body: 'invalid',
          headers: { 'content-type': 'multipart/form-data' },
        })
      )
    ).toBeNull();
  });

  it('does not pull more chunks after exceeding the cap', async () => {
    const cancel = vi.fn();
    const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new Uint8Array(MAX_DIRECT_FILE_BYTES));
    });
    const body = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
    expect(await readUploadForm({ body, headers: new Headers() } as Request)).toBe('too-large');
    expect(pull).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it('returns null and releases the stream lock on a read failure', async () => {
    const body = new ReadableStream({
      pull(controller) {
        controller.error(new Error('read failed'));
      },
    });
    expect(await readUploadForm({ body, headers: new Headers() } as Request)).toBeNull();
    expect(body.locked).toBe(false);
  });
});
