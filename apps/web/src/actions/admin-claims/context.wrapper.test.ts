import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
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

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

describe('admin-claims getActionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return session, authority and headers', async () => {
    const mockHeaders = new Headers();
    mockHeaders.set('x-test', 'true');
    vi.mocked(headers).mockResolvedValue(mockHeaders);

    const mockSession = { user: { id: '1' } };
    const authority = mintTestTenantAuthority('tenant-1');
    vi.mocked(authorizeSessionTenant).mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session: mockSession as any,
      authority,
    });

    const result = await getActionContext();

    expect(result.session).toBe(mockSession);
    expect(result.authority).toBe(authority);
    expect(result.requestHeaders).toBe(mockHeaders);
    expect(authorizeSessionTenant).toHaveBeenCalledWith(mockHeaders);
  });

  it('returns null session and authority when unauthenticated', async () => {
    const mockHeaders = new Headers();
    vi.mocked(headers).mockResolvedValue(mockHeaders);
    vi.mocked(authorizeSessionTenant).mockResolvedValue(null);

    const result = await getActionContext();

    expect(result.session).toBeNull();
    expect(result.authority).toBeNull();
    expect(result.requestHeaders).toBe(mockHeaders);
  });
});
