import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectMissingTenantIdentity,
  hoistedMocks,
  mockInsertChain,
  mockSelectChain,
  mockUpdateChain,
  mockWithTenantContext,
  notificationPostRequest,
} from './route.post.test-support';
import { POST } from './route';

describe('POST /api/settings/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.where.mockReturnThis();
    mockSelectChain.limit.mockReturnValue([]);
    mockInsertChain.values.mockResolvedValue(undefined);
    mockUpdateChain.set.mockReturnThis();
    mockUpdateChain.where.mockResolvedValue(undefined);
  });

  it('should return 401 if user is not authenticated', async () => {
    hoistedMocks.getSession.mockResolvedValue(null);

    const response = await POST(notificationPostRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 if the session is missing tenant identity', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: undefined },
    });

    await expectMissingTenantIdentity(await POST(notificationPostRequest()));
  });

  it('should create new preferences if none exist', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([]);

    const preferences = {
      emailClaimUpdates: false,
      emailMarketing: true,
      emailNewsletter: false,
      pushClaimUpdates: false,
      pushMessages: false,
      inAppAll: false,
    };

    const request = new Request('http://localhost:3000/api/settings/notifications', {
      method: 'POST',
      body: JSON.stringify(preferences),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(readTenantAuthority(mockWithTenantContext.mock.calls[0][0]).tenantId).toBe('tenant_mk');
    expect(mockInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id-123',
        userId: 'user-123',
        ...preferences,
      })
    );
  });

  it('should update existing preferences', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'pref-123',
        userId: 'user-123',
        emailClaimUpdates: true,
        emailMarketing: false,
        emailNewsletter: true,
        pushClaimUpdates: true,
        pushMessages: true,
        inAppAll: true,
      },
    ]);

    const preferences = {
      emailClaimUpdates: false,
      emailMarketing: true,
      emailNewsletter: false,
      pushClaimUpdates: false,
      pushMessages: false,
      inAppAll: false,
    };

    const request = new Request('http://localhost:3000/api/settings/notifications', {
      method: 'POST',
      body: JSON.stringify(preferences),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        ...preferences,
        updatedAt: expect.any(Date),
      })
    );
  });

  it('should handle database errors gracefully on create', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([]);
    mockInsertChain.values.mockRejectedValue(new Error('DB Error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = new Request('http://localhost:3000/api/settings/notifications', {
      method: 'POST',
      body: JSON.stringify({
        emailClaimUpdates: true,
        emailMarketing: false,
        emailNewsletter: true,
        pushClaimUpdates: true,
        pushMessages: true,
        inAppAll: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    consoleErrorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to save preferences' });
  });

  it('should handle database errors gracefully on update', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([{ id: 'pref-123' }]);
    mockUpdateChain.where.mockRejectedValue(new Error('DB Error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = new Request('http://localhost:3000/api/settings/notifications', {
      method: 'POST',
      body: JSON.stringify({
        emailClaimUpdates: true,
        emailMarketing: false,
        emailNewsletter: true,
        pushClaimUpdates: true,
        pushMessages: true,
        inAppAll: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    consoleErrorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to save preferences' });
  });

  it('should handle invalid JSON gracefully', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });

    const request = new Request('http://localhost:3000/api/settings/notifications', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON' });
  });
});
