import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePublicLink, normalizeWhatsAppShareUrl } from './public-links';
import { getServerDeploymentOrigin } from './deployment-origin.server';
import { stubDeploymentOrigin, PRODUCTION_DOOR } from './deployment-origin.test-support';

afterEach(() => vi.unstubAllEnvs());

describe('server-resolved public destinations', () => {
  it.each(['https://staging.interdomestik.com', undefined])(
    'preserves server-resolved production links with build value %s',
    buildValue => {
      stubDeploymentOrigin('production', PRODUCTION_DOOR);
      const link = `${getServerDeploymentOrigin()}?ref=EXISTING-CODE`;
      vi.stubEnv('NEXT_PUBLIC_APP_URL', buildValue);
      expect(normalizePublicLink(link, 'https://ks.interdomestik.com')).toBe(link);
      const text = `Join ${link}`;
      const share = `https://wa.me/?text=${encodeURIComponent(text)}`;
      expect(normalizeWhatsAppShareUrl(share)).toBe(share);
    }
  );
});
