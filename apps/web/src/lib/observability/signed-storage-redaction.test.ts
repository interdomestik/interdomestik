import { describe, expect, it } from 'vitest';
import {
  redactSignedStorageBreadcrumb,
  redactSignedStorageSpan,
  redactSignedStorageUrls,
} from './signed-storage-redaction';

const signedUrl =
  'https://storage.example/storage/v1/object/sign/claim-evidence/tenant/file.pdf?token=secret-jwt&download=file.pdf';

describe('signed storage telemetry redaction', () => {
  it('removes the complete capability query from breadcrumb data and messages', () => {
    const breadcrumb = redactSignedStorageBreadcrumb({
      category: 'fetch',
      data: { method: 'GET', url: signedUrl },
      message: `GET ${signedUrl}`,
    });

    expect(JSON.stringify(breadcrumb)).not.toContain('secret-jwt');
    expect(breadcrumb.data?.url).toBe(
      'https://storage.example/storage/v1/object/sign/claim-evidence/tenant/file.pdf?signed-capability=redacted'
    );
  });

  it('removes capabilities from every string span attribute and its description', () => {
    const span = redactSignedStorageSpan({
      data: {
        url: signedUrl,
        'http.url': signedUrl,
        'url.full': signedUrl,
        'http.query': '?token=secret-jwt&download=file.pdf',
        status: 200,
      },
      description: signedUrl,
      span_id: 'span-id',
    });

    expect(JSON.stringify(span)).not.toContain('secret-jwt');
    expect(span.data['http.url']).toContain('signed-capability=redacted');
    expect(span.data['url.full']).toContain('signed-capability=redacted');
    expect(span.data['http.query']).toBe('?signed-capability=redacted');
    expect(span.description).toContain('signed-capability=redacted');
  });

  it('does not rewrite an unrelated standalone query', () => {
    const span = redactSignedStorageSpan({
      data: {
        url: 'https://example.test/account?token=ordinary',
        'http.query': '?token=ordinary',
      },
      description: 'GET https://example.test/account',
    });

    expect(span.data['http.query']).toBe('?token=ordinary');
  });

  it('leaves unrelated token-bearing and malformed URLs unchanged', () => {
    const unrelated = 'https://example.test/account?token=ordinary';
    expect(redactSignedStorageUrls(unrelated)).toBe(unrelated);
    expect(redactSignedStorageUrls('not a URL token=secret')).toBe('not a URL token=secret');
  });
});
