import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockSession = { user: { id: string } } | null;

const sharedHeaders = new Headers({
  cookie: 'better-auth.session_token=token',
  host: 'ks.localhost:3000',
});

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn<() => Promise<MockSession>>(async () => ({
    user: { id: 'staff-1' },
  })),
  headersMock: vi.fn(async () => sharedHeaders),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

import { getSessionSafe } from './session';

describe('getSessionSafe', () => {
  beforeEach(() => {
    hoisted.getSessionMock.mockClear();
  });

  it('deduplicates session fetches for the same request signature', async () => {
    const first = await getSessionSafe('StaffLayout');
    const second = await getSessionSafe('StaffClaimsPage');

    expect(first).toEqual(second);
    expect(hoisted.getSessionMock).toHaveBeenCalledTimes(1);
  });

  it('returns immediately without retry when no auth hint is present', async () => {
    hoisted.headersMock.mockResolvedValueOnce(new Headers({ host: 'ks.localhost:3000' }));
    hoisted.getSessionMock.mockResolvedValueOnce(null);

    const session = await getSessionSafe('LoggedOutRequest');

    expect(session).toBeNull();
    expect(hoisted.getSessionMock).toHaveBeenCalledTimes(1);
  });
});
