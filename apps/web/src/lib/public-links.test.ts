import { describe, expect, it } from 'vitest';

import { normalizePublicLink, normalizeWhatsAppShareUrl } from './public-links';

describe('public-links', () => {
  it('replaces localhost fallback origins with the current live origin', () => {
    expect(
      normalizePublicLink('http://localhost:3000?ref=ABC123', 'http://mk.127.0.0.1.nip.io:3000')
    ).toBe('http://mk.127.0.0.1.nip.io:3000/?ref=ABC123');
  });

  it('keeps the existing path and query when normalizing share URLs', () => {
    expect(
      normalizeWhatsAppShareUrl(
        'https://wa.me/?text=Join%20Asistenca%20with%20my%20referral%20link%20http%3A%2F%2Flocalhost%3A3000%3Fref%3DABC123',
        'http://ks.127.0.0.1.nip.io:3000'
      )
    ).toBe(
      'https://wa.me/?text=Join+Asistenca+with+my+referral+link+http%3A%2F%2Fks.127.0.0.1.nip.io%3A3000%2F%3Fref%3DABC123'
    );
  });
});
