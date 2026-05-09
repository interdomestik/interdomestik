import { describe, expect, it } from 'vitest';

import {
  SIGNED_URL_NO_STORE_CACHE_CONTROL,
  SIGNED_URL_REFERRER_POLICY,
  redactSignedUrlErrorDetails,
  redactSignedUrlText,
  signedUrlResponseInit,
} from './signed-url-exposure';

describe('signed URL exposure controls', () => {
  it('sets no-store and no-referrer response headers', () => {
    const init = signedUrlResponseInit({ status: 200 });
    const headers = new Headers(init.headers);

    expect(init.status).toBe(200);
    expect(headers.get('Cache-Control')).toBe(SIGNED_URL_NO_STORE_CACHE_CONTROL);
    expect(headers.get('Referrer-Policy')).toBe(SIGNED_URL_REFERRER_POLICY);
  });

  it('redacts signed URL-shaped values from log messages', () => {
    const message = redactSignedUrlText(
      new Error('failed https://storage.example/object/sign/file.pdf?token=secret-token')
    );

    expect(message).toBe(
      'failed https://storage.example/object/sign/file.pdf?[signed-url-redacted]'
    );
    expect(message).not.toContain('secret-token');
  });

  it('preserves redacted error debugging details', () => {
    const error = new Error(
      'failed https://storage.example/object/sign/file.pdf?token=secret-token'
    );
    error.stack =
      'Error: failed\n    at https://storage.example/object/sign/file.pdf?token=stack-token';

    const details = redactSignedUrlErrorDetails(error);

    expect(details).toMatchObject({
      name: 'Error',
      message: 'failed https://storage.example/object/sign/file.pdf?[signed-url-redacted]',
    });
    expect(details.stack).toContain('https://storage.example/object/sign/file.pdf?');
    expect(details.stack).not.toContain('stack-token');
  });
});
