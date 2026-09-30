import { act, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserChoices } from '@/actions/admin-users';
import { listBranches } from '@/actions/admin-rbac.core';
import { useAddAgentOptions } from './use-add-agent-options';

vi.mock('@/actions/admin-users', () => ({
  getUserChoices: vi.fn(),
}));

vi.mock('@/actions/admin-rbac.core', () => ({
  listBranches: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockedGetUserChoices = vi.mocked(getUserChoices);
const mockedListBranches = vi.mocked(listBranches);

beforeEach(() => {
  mockedGetUserChoices.mockReset();
  mockedListBranches.mockReset();
});

describe('useAddAgentOptions', () => {
  it('makes zero reads while closed', () => {
    renderHook(() => useAddAgentOptions(false, 'foo'));

    expect(mockedGetUserChoices).not.toHaveBeenCalled();
    expect(mockedListBranches).not.toHaveBeenCalled();
  });

  it('fetches concurrently on open, normalizes search, filters eligibility and projects fields, requiring both successes', async () => {
    const usersDeferred = createDeferred<Awaited<ReturnType<typeof getUserChoices>>>();
    const branchesDeferred = createDeferred<Awaited<ReturnType<typeof listBranches>>>();
    mockedGetUserChoices.mockReturnValue(usersDeferred.promise as never);
    mockedListBranches.mockReturnValue(branchesDeferred.promise as never);

    const { result } = renderHook(() => useAddAgentOptions(true, '  ana  '));

    expect(mockedGetUserChoices).toHaveBeenCalledWith({
      search: 'ana',
      role: 'user,member,staff',
      assignment: undefined,
    });
    expect(mockedListBranches).toHaveBeenCalledWith({ includeInactive: false });
    expect(result.current.status).toBe('loading');

    await act(async () => {
      usersDeferred.resolve({
        success: true,
        data: [
          { id: '1', name: 'Ana', email: 'ana@example.com', role: 'user' },
          { id: '2', name: 'Admin', email: 'admin@example.com', role: 'admin' },
        ],
      } as never);
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      branchesDeferred.resolve({
        success: true,
        data: [{ id: 'b1', name: 'Branch One', isActive: true }],
      } as never);
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.users).toEqual([{ id: '1', name: 'Ana', email: 'ana@example.com' }]);
    expect(result.current.branches).toEqual([{ id: 'b1', name: 'Branch One' }]);
  });

  it('ignores stale responses when the dialog closes before fetch resolves', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof getUserChoices>>>();
    mockedGetUserChoices.mockReturnValue(deferred.promise as never);
    mockedListBranches.mockResolvedValue({ success: true, data: [] } as never);

    const { result, rerender } = renderHook(
      ({ open, search }: { open: boolean; search: string }) => useAddAgentOptions(open, search),
      { initialProps: { open: true, search: 'a' } }
    );

    rerender({ open: false, search: 'a' });
    expect(result.current.status).toBe('idle');

    await act(async () => {
      deferred.resolve({
        success: true,
        data: [{ id: '1', name: 'Ana', email: 'a@x.com', role: 'user' }],
      } as never);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.users).toEqual([]);
  });

  it('ignores stale responses when search changes before the previous fetch resolves', async () => {
    const firstDeferred = createDeferred<Awaited<ReturnType<typeof getUserChoices>>>();
    const secondDeferred = createDeferred<Awaited<ReturnType<typeof getUserChoices>>>();
    mockedGetUserChoices
      .mockReturnValueOnce(firstDeferred.promise as never)
      .mockReturnValueOnce(secondDeferred.promise as never);
    mockedListBranches.mockResolvedValue({ success: true, data: [] } as never);

    const { result, rerender } = renderHook(
      ({ open, search }: { open: boolean; search: string }) => useAddAgentOptions(open, search),
      { initialProps: { open: true, search: 'first' } }
    );

    rerender({ open: true, search: 'second' });

    await act(async () => {
      firstDeferred.resolve({
        success: true,
        data: [{ id: 'stale', name: 'Stale', email: 's@x.com', role: 'user' }],
      } as never);
    });

    expect(result.current.status).toBe('loading');

    await act(async () => {
      secondDeferred.resolve({
        success: true,
        data: [{ id: 'fresh', name: 'Fresh', email: 'f@x.com', role: 'user' }],
      } as never);
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.users).toEqual([{ id: 'fresh', name: 'Fresh', email: 'f@x.com' }]);
  });

  it('clears both lists on a failed action result and allows a fresh retry', async () => {
    mockedGetUserChoices
      .mockResolvedValueOnce({ success: false, error: 'unauthorized', code: 'FORBIDDEN' } as never)
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: '1', name: 'Ana', email: 'a@x.com', role: 'user' }],
      } as never);
    mockedListBranches.mockResolvedValue({
      success: true,
      data: [{ id: 'b1', name: 'Branch' }],
    } as never);

    const { result } = renderHook(() => useAddAgentOptions(true, undefined));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.users).toEqual([]);
    expect(result.current.branches).toEqual([]);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(mockedGetUserChoices).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.users).toEqual([{ id: '1', name: 'Ana', email: 'a@x.com' }]);
  });

  it('clears both lists when an action throws', async () => {
    mockedGetUserChoices.mockRejectedValue(new Error('network down'));
    mockedListBranches.mockResolvedValue({ success: true, data: [] } as never);

    const { result } = renderHook(() => useAddAgentOptions(true, undefined));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.users).toEqual([]);
    expect(result.current.branches).toEqual([]);
  });

  it('does not loop or leak stale writes under React StrictMode double-invocation', async () => {
    mockedGetUserChoices.mockResolvedValue({
      success: true,
      data: [{ id: '1', name: 'Ana', email: 'a@x.com', role: 'user' }],
    } as never);
    mockedListBranches.mockResolvedValue({
      success: true,
      data: [{ id: 'b1', name: 'Branch' }],
    } as never);

    const { result } = renderHook(() => useAddAgentOptions(true, undefined), {
      wrapper: React.StrictMode,
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.users).toEqual([{ id: '1', name: 'Ana', email: 'a@x.com' }]);
  });
  it('refetches permissions on every reopen instead of retaining previous options', async () => {
    mockedGetUserChoices
      .mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'staff-1', name: 'Staff Candidate', email: 'staff@example.com', role: 'staff' },
          { id: 'member-1', name: 'Member Candidate', email: 'member@example.com', role: 'member' },
          { id: 'agent-1', name: 'Existing Agent', email: 'agent@example.com', role: 'agent' },
          { id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'admin' },
        ],
      } as never)
      .mockResolvedValueOnce({ success: false, error: 'forbidden', code: 'FORBIDDEN' } as never);
    mockedListBranches.mockResolvedValue({
      success: true,
      data: [{ id: 'b1', name: 'Branch' }],
    } as never);
    const { result, rerender } = renderHook(({ open }) => useAddAgentOptions(open), {
      initialProps: { open: true },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.users).toEqual([
      { id: 'staff-1', name: 'Staff Candidate', email: 'staff@example.com' },
      { id: 'member-1', name: 'Member Candidate', email: 'member@example.com' },
    ]);
    rerender({ open: false });
    expect(result.current.users).toEqual([]);
    rerender({ open: true });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(mockedGetUserChoices).toHaveBeenCalledTimes(2);
    expect(mockedListBranches).toHaveBeenCalledTimes(2);
    expect(result.current.users).toEqual([]);
    expect(result.current.branches).toEqual([]);
  });

  it('never exposes earlier ready options during any render of a changed search', async () => {
    mockedGetUserChoices
      .mockResolvedValueOnce({
        success: true,
        data: [{ id: 'old', name: 'Old', email: 'old@example.com', role: 'user' }],
      } as never)
      .mockReturnValueOnce(new Promise(() => {}));
    mockedListBranches.mockResolvedValue({ success: true, data: [] } as never);
    const snapshots: Array<{ search: string; status: string; ids: string[] }> = [];
    const { result, rerender } = renderHook(
      ({ search }) => {
        const options = useAddAgentOptions(true, search);
        snapshots.push({ search, status: options.status, ids: options.users.map(user => user.id) });
        return options;
      },
      { initialProps: { search: 'old' } }
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    rerender({ search: 'new' });
    const changed = snapshots.filter(snapshot => snapshot.search === 'new');
    expect(changed.length).toBeGreaterThan(0);
    expect(
      changed.every(snapshot => snapshot.status === 'loading' && snapshot.ids.length === 0)
    ).toBe(true);
  });

  it('clears available users when the branch authorization check fails', async () => {
    mockedGetUserChoices.mockResolvedValue({
      success: true,
      data: [{ id: '1', name: 'Ana', email: 'ana@example.com', role: 'user' }],
    } as never);
    mockedListBranches.mockResolvedValue({ success: false, error: 'forbidden' } as never);
    const { result } = renderHook(() => useAddAgentOptions(true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.users).toEqual([]);
    expect(result.current.branches).toEqual([]);
  });
});
