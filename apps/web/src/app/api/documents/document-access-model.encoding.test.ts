import { describe, expect, it } from 'vitest';

import { encodeContentDispositionFilename } from './document-access-model';

describe('encodeContentDispositionFilename', () => {
  it('percent-encodes the RFC 5987 extra characters exactly', () => {
    expect(encodeContentDispositionFilename("a'b(c)d*e.pdf")).toBe('a%27b%28c%29d%2Ae.pdf');
  });
});
