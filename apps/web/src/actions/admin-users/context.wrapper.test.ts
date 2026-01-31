import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getActionContext } from './context.core';

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

describe('admin-users getActionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return session and headers', async () => {
    const mockHeaders = new Headers();
    vi.mocked(headers).mockResolvedValue(mockHeaders);

    const mockSession = { user: { id: 'admin-1' } };
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession);

    const result = await getActionContext();

    expect(result.session).toBe(mockSession);
    expect(result.requestHeaders).toBe(mockHeaders);
  });
});
