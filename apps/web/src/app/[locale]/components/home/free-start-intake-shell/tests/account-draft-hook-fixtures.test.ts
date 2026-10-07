import { describe, expect, it, vi } from 'vitest';
import { configureDefaultActions, type DraftActionMocks } from './account-draft-hook-fixtures';
import { saved } from './terminal-draft-fixtures';

// Importing the shared fixtures loads the hook; keep its server actions suite-owned and inert.
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: vi.fn(),
  createFreeStartDraft: vi.fn(),
  updateFreeStartDraft: vi.fn(),
  listFreeStartDrafts: vi.fn(),
  resumeFreeStartDraft: vi.fn(),
  deleteFreeStartDraft: vi.fn(),
}));

function suiteMocks(): DraftActionMocks {
  return {
    account: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    resume: vi.fn(),
    remove: vi.fn(),
  };
}

/** An update input whose expectedVersion getter observes every evaluation. */
function versionInput(read: () => number): { expectedVersion: number } {
  const input = {} as { expectedVersion: number };
  Object.defineProperty(input, 'expectedVersion', { enumerable: true, get: read });
  return input;
}

describe('configureDefaultActions update default', () => {
  it('reads expectedVersion synchronously once and resolves a real promise', async () => {
    const actions = suiteMocks();
    configureDefaultActions(actions);
    const read = vi.fn(() => 4);

    const result: unknown = actions.update(versionInput(read));
    expect(read).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual({ ok: true, draft: { ...saved, version: 5 } });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('returns a rejected promise instead of throwing when the getter throws', async () => {
    const actions = suiteMocks();
    configureDefaultActions(actions);
    const failure = new Error('expectedVersion unavailable');
    const read = vi.fn((): number => {
      throw failure;
    });

    let result: unknown;
    expect(() => {
      result = actions.update(versionInput(read));
    }).not.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toBe(failure);
  });
});
