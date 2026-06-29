import { describe, expect, it } from 'vitest';

import { branchSlugFromName } from './branch-slug';

describe('branchSlugFromName', () => {
  it('normalizes branch names without regular-expression replacement', () => {
    expect(branchSlugFromName('  Main Office - KS_A  ')).toBe('main-office-ks-a');
    expect(branchSlugFromName('***')).toBe('');
  });

  it('handles long separator-heavy names in linear time', () => {
    const name = `${' Branch___'.repeat(500)} Office `;
    expect(branchSlugFromName(name)).toMatch(/^branch-/);
    expect(branchSlugFromName(name)).toContain('-office');
  });
});
