import { describe, expect, it } from 'vitest';

import { generateViewport } from './_segment-exports';

describe('segment exports viewport', () => {
  it('returns an explicit mobile-friendly viewport config', async () => {
    await expect(generateViewport()).resolves.toEqual({
      width: 'device-width',
      initialScale: 1,
      maximumScale: 5,
      themeColor: '#ffffff',
    });
  });
});
