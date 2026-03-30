import { describe, expect, it } from 'vitest';

import { localizeSeededBranchName } from './localize-seeded-branch-name';

describe('localizeSeededBranchName', () => {
  it('keeps unknown names untouched', () => {
    expect(localizeSeededBranchName('Branch Delta', 'mk')).toBe('Branch Delta');
  });

  it('localizes seeded MK branch labels for Macedonian and Serbian surfaces', () => {
    expect(localizeSeededBranchName('MK Branch A (Main)', 'mk')).toBe('Филијала MK A (Главна)');
    expect(localizeSeededBranchName('MK Branch A (Main)', 'sr')).toBe('Filijala MK A (Glavna)');
  });

  it('localizes seeded KS branch labels for Albanian surfaces', () => {
    expect(localizeSeededBranchName('KS Branch A (Prishtina)', 'sq')).toBe('Dega KS A (Prishtinë)');
  });
});
