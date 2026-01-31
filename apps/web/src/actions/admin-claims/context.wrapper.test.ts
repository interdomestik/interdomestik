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

describe('admin-claims getActionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return session and headers', async () => {
    const mockHeaders = new Headers();
    mockHeaders.set('x-test', 'true');
    vi.mocked(headers).mockResolvedValue(mockHeaders);

    const mockSession = { user: { id: '1' } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as any);

    const result = await getActionContext();

    expect(result.session).toBe(mockSession);
    expect(result.requestHeaders).toBe(mockHeaders);
    expect(auth.api.getSession).toHaveBeenCalledWith({ headers: mockHeaders });
  });
});
