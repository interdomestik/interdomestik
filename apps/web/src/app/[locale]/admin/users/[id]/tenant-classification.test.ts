import { describe, expect, it } from 'vitest';

import { getTenantClassificationOptions } from './tenant-classification';

describe('getTenantClassificationOptions', () => {
  it('offers no reassignment targets while online tenant reassignment is unavailable', () => {
    expect(getTenantClassificationOptions()).toEqual([]);
  });
});
