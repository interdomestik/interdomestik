import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedHeaders = new Headers({
  cookie: 'better-auth.session_token=token',
  host: 'ks.localhost:3000',
});

const hoisted = vi.hoisted(() => ({
  getSessionMock: vi.fn(async () => ({
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
});
