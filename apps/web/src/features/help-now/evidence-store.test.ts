import { afterEach, describe, expect, it } from 'vitest';
import { listEvidenceItems, saveEvidenceItem } from './evidence-store';

const STORAGE_KEY = 'interdomestik.helpNow.evidenceBundle.v1';

describe('evidence-store', () => {
  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('falls back to an empty evidence list for non-array stored JSON', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ promptId: 'shot-1' }));

    expect(listEvidenceItems()).toEqual([]);
    expect(() =>
      saveEvidenceItem('shot-1', new File(['id'], 'passport.jpg', { type: 'image/jpeg' }))
    ).not.toThrow();
    expect(listEvidenceItems()).toEqual([
      expect.objectContaining({
        promptId: 'shot-1',
        fileName: 'passport.jpg',
        fileSize: 2,
        fileType: 'image/jpeg',
      }),
    ]);
  });
});
