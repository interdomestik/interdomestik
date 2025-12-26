import { describe, expect, it } from 'vitest';

import { getWrappedStatsCore } from './get';

describe('actions/wrapped getWrappedStatsCore', () => {
  it('throws Unauthorized when not authenticated', async () => {
    await expect(getWrappedStatsCore({ session: null })).rejects.toThrow('Unauthorized');
  });
});
