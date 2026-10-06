import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { EMPTY_DRAFT } from './constants';
import { writeAnonymousDraft } from './anonymous-draft-recovery';
import { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';
const snapshot = {
  category: 'property' as const,
  draft: { ...EMPTY_DRAFT, summary: 'Water damaged the garage.' },
  resumeStep: 'details' as const,
};
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: vi.fn((_name, _options, callback) => Promise.resolve(callback())) },
  });
  writeAnonymousDraft(localStorage, snapshot, null);
});
function setup(onReset: (beforeReset?: () => Promise<boolean> | boolean) => Promise<boolean>) {
  const onRestore = vi.fn();
  const hook = renderHook(() =>
    useAnonymousDraftRecovery({
      activeId: null,
      allowWrites: true,
      category: 'vehicle',
      draft: EMPTY_DRAFT,
      lifecycleState: 'idle',
      neutralHost: location.host,
      onReset,
      onRestore,
      resetCategory: 'vehicle',
      step: 'details',
    })
  );
  return { ...hook, onRestore };
}
it('settles the terminal reset before restoring consented notes', async () => {
  let finish!: (value: boolean) => void;
  const reset = vi.fn(
    () =>
      new Promise<boolean>(resolve => {
        finish = resolve;
      })
  );
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  act(() => hook.result.current.resume());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  expect(hook.onRestore).not.toHaveBeenCalled();
  await act(async () => finish(true));
  await waitFor(() =>
    expect(hook.onRestore).toHaveBeenCalledWith(expect.objectContaining(snapshot))
  );
});
it('preserves the offered copy when terminal retirement refuses', async () => {
  const hook = setup(async () => false);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  act(() => hook.result.current.resume());
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(hook.onRestore).not.toHaveBeenCalled();
  expect(hook.result.current.offer?.draft.summary).toBe(snapshot.draft.summary);
});
it('does not restore after unmount while terminal retirement is pending', async () => {
  let finish!: (value: boolean) => void;
  const reset = vi.fn(
    () =>
      new Promise<boolean>(resolve => {
        finish = resolve;
      })
  );
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  act(() => hook.result.current.resume());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  hook.unmount();
  await act(async () => finish(true));
  expect(hook.onRestore).not.toHaveBeenCalled();
});

it('retains consented notes when terminal retirement rejects', async () => {
  const reset = vi.fn(async () => {
    throw new Error('retirement failed');
  });
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  act(() => hook.result.current.resume());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(hook.result.current.offer).not.toBeNull();
  expect(hook.onRestore).not.toHaveBeenCalled();
  expect(hook.result.current.offer?.draft.summary).toBe(snapshot.draft.summary);
});
it('revalidates the copy after delayed retirement instead of adopting superseded notes', async () => {
  let finish!: (value: boolean) => void;
  const reset = vi.fn(
    () =>
      new Promise<boolean>(resolve => {
        finish = resolve;
      })
  );
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  act(() => hook.result.current.resume());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  localStorage.clear();
  writeAnonymousDraft(
    localStorage,
    { ...snapshot, draft: { ...snapshot.draft, summary: 'Newer consented copy.' } },
    null
  );
  await act(async () => finish(true));
  await waitFor(() =>
    expect(hook.result.current.offer?.draft.summary).toBe('Newer consented copy.')
  );
  expect(hook.onRestore).not.toHaveBeenCalled();
});

it('keeps discard busy and preserves its copy until terminal retirement settles', async () => {
  let finish!: (value: boolean) => void;
  const reset = vi.fn(async (beforeReset?: () => Promise<boolean> | boolean) => {
    const allowed = await new Promise<boolean>(resolve => {
      finish = resolve;
    });
    return allowed && Boolean(await beforeReset?.());
  });
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  const original = localStorage.getItem('interdomestik_free_start_recovery_v1');
  act(() => hook.result.current.discard());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  expect(hook.result.current.busy).toBe(true);
  expect(localStorage.getItem('interdomestik_free_start_recovery_v1')).toBe(original);
  await act(async () => finish(true));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(localStorage.getItem('interdomestik_free_start_recovery_v1')).toBeNull();
});
it('preserves the copy when discard retirement rejects', async () => {
  const reset = vi.fn(async () => {
    throw new Error('retirement failed');
  });
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  const original = localStorage.getItem('interdomestik_free_start_recovery_v1');
  act(() => hook.result.current.discard());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(localStorage.getItem('interdomestik_free_start_recovery_v1')).toBe(original);
});
it('does not let a rejected old resume overwrite a newer deletion', async () => {
  let reject!: (error: Error) => void;
  const reset = vi.fn(
    () =>
      new Promise<boolean>((_resolve, fail) => {
        reject = fail;
      })
  );
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  act(() => hook.result.current.resume());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  localStorage.clear();
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'interdomestik_free_start_recovery_v1', newValue: null })
    )
  );
  await waitFor(() => expect(hook.result.current.state).toBe('discarded'));
  await act(async () => reject(new Error('old retirement failed')));
  expect(hook.result.current.state).toBe('discarded');
  expect(hook.result.current.offer).toBeNull();
  expect(hook.onRestore).not.toHaveBeenCalled();
});

it('preserves the copy when discard retirement refuses', async () => {
  const reset = vi.fn(async () => false);
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  const original = localStorage.getItem('interdomestik_free_start_recovery_v1');
  act(() => hook.result.current.discard());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(localStorage.getItem('interdomestik_free_start_recovery_v1')).toBe(original);
  expect(hook.onRestore).not.toHaveBeenCalled();
});
it('does not clear the copy after unmount during discard retirement', async () => {
  let finish!: (value: boolean) => void;
  const reset = vi.fn(async (beforeReset?: () => Promise<boolean> | boolean) => {
    const allowed = await new Promise<boolean>(resolve => {
      finish = resolve;
    });
    return allowed && Boolean(await beforeReset?.());
  });
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  const original = localStorage.getItem('interdomestik_free_start_recovery_v1');
  act(() => hook.result.current.discard());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  hook.unmount();
  await act(async () => finish(true));
  expect(localStorage.getItem('interdomestik_free_start_recovery_v1')).toBe(original);
});
it('does not let a rejected old resume overwrite a replacement offer', async () => {
  let reject!: (error: Error) => void;
  const reset = vi.fn(
    () =>
      new Promise<boolean>((_resolve, fail) => {
        reject = fail;
      })
  );
  const hook = setup(reset);
  await waitFor(() => expect(hook.result.current.state).toBe('offer'));
  act(() => hook.result.current.resume());
  await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  localStorage.clear();
  writeAnonymousDraft(
    localStorage,
    { ...snapshot, draft: { ...snapshot.draft, summary: 'Replacement copy.' } },
    null
  );
  act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'interdomestik_free_start_recovery_v1',
        newValue: localStorage.getItem('interdomestik_free_start_recovery_v1'),
      })
    )
  );
  await waitFor(() => expect(hook.result.current.offer?.draft.summary).toBe('Replacement copy.'));
  await act(async () => reject(new Error('old retirement failed')));
  expect(hook.result.current.state).toBe('conflict');
  expect(hook.result.current.offer?.draft.summary).toBe('Replacement copy.');
  expect(hook.onRestore).not.toHaveBeenCalled();
});
