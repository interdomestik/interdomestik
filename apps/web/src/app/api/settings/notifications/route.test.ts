import {
  hoistedMocks,
  mockSelectChain,
  mockWithTenantContext,
  expectMissingTenantIdentity,
} from './route.post.test-support';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('GET /api/settings/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.where.mockReturnThis();
    mockSelectChain.limit.mockReturnValue([]);
  });

  it('should return 401 if user is not authenticated', async () => {
    hoistedMocks.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 if the session is missing tenant identity', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: null },
    });

    const request = new Request('http://localhost:3000/api/settings/notifications');
    await expectMissingTenantIdentity(await GET(request));
  });

  it('should return default preferences if none exist', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([]);

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(readTenantAuthority(mockWithTenantContext.mock.calls[0][0]).tenantId).toBe('tenant_mk');
    expect(data).toEqual({
      emailClaimUpdates: true,
      emailMarketing: false,
      emailNewsletter: true,
      pushClaimUpdates: true,
      pushMessages: true,
      inAppAll: true,
    });
  });

  it('should return existing preferences', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([
      {
        emailClaimUpdates: false,
        emailMarketing: true,
        emailNewsletter: false,
        pushClaimUpdates: false,
        pushMessages: false,
        inAppAll: false,
      },
    ]);

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      emailClaimUpdates: false,
      emailMarketing: true,
      emailNewsletter: false,
      pushClaimUpdates: false,
      pushMessages: false,
      inAppAll: false,
    });
  });

  it('should handle database errors gracefully', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockRejectedValue(new Error('DB Error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    consoleErrorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to fetch preferences' });
  });
});
