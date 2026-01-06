import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActionContext } from './context.core';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

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
    (headers as any).mockResolvedValue(mockHeaders);

    const mockSession = { user: { id: '1' } };
    (auth.api.getSession as any).mockResolvedValue(mockSession);

    const result = await getActionContext();

    expect(result.session).toBe(mockSession);
    expect(result.requestHeaders).toBe(mockHeaders);
    expect(auth.api.getSession).toHaveBeenCalledWith({ headers: mockHeaders });
  });
});
