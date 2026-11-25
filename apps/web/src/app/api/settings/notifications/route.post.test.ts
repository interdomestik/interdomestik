import { refuseAcceptance } from '@/test/member-acceptance.test-support';
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
  samplePreferences,
} from './route.post.test-support';
import { upsertNotificationPreferencesCore } from './_core';
import { POST } from './route';

const updatedPreferences = {
  emailClaimUpdates: false,
  emailMarketing: true,
  emailNewsletter: false,
  pushClaimUpdates: false,
  pushMessages: false,
  inAppAll: false,
};

function signInTenantMember(): void {
  hoistedMocks.getSession.mockResolvedValue({
    user: { id: 'user-123', role: 'member', tenantId: 'tenant_mk' },
  });
}

function rawPostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/settings/notifications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function expectNoPreferenceWrite(): void {
  expect(mockInsertChain.values).not.toHaveBeenCalled();
  expect(mockUpdateChain.set).not.toHaveBeenCalled();
}

async function postAndRead(request: Request): Promise<{ response: Response; data: unknown }> {
  const response = await POST(request);
  return { response, data: await response.json() };
}

async function postSilencingErrors(): Promise<{ response: Response; data: unknown }> {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = await postAndRead(notificationPostRequest(samplePreferences));
  consoleErrorSpy.mockRestore();
  return result;
}

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

  it('refuses before protected work when acceptance is missing', async () => {
    refuseAcceptance();
    signInTenantMember();
    const response = await POST(notificationPostRequest());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'acceptance_required' });
    expect(mockWithTenantContext).not.toHaveBeenCalled();
    expectNoPreferenceWrite();
  });

  it('should return 401 if user is not authenticated', async () => {
    hoistedMocks.getSession.mockResolvedValue(null);

    const response = await POST(notificationPostRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('should return 401 if the session is missing tenant identity', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', role: 'member', tenantId: undefined },
    });

    await expectMissingTenantIdentity(await POST(notificationPostRequest()));
  });

  it('should create new preferences if none exist', async () => {
    signInTenantMember();
    mockSelectChain.limit.mockReturnValue([]);

    const preferences = updatedPreferences;
    const { response, data } = await postAndRead(notificationPostRequest(preferences));

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
    signInTenantMember();
    mockSelectChain.limit.mockReturnValue([
      { id: 'pref-123', userId: 'user-123', ...samplePreferences },
    ]);

    const preferences = updatedPreferences;
    const { response, data } = await postAndRead(notificationPostRequest(preferences));

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
    signInTenantMember();
    mockSelectChain.limit.mockReturnValue([]);
    mockInsertChain.values.mockRejectedValue(new Error('DB Error'));

    const { response, data } = await postSilencingErrors();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to save preferences' });
  });

  it('should handle database errors gracefully on update', async () => {
    signInTenantMember();
    mockSelectChain.limit.mockReturnValue([{ id: 'pref-123' }]);
    mockUpdateChain.where.mockRejectedValue(new Error('DB Error'));

    const { response, data } = await postSilencingErrors();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to save preferences' });
  });

  it('should handle invalid JSON gracefully', async () => {
    signInTenantMember();

    const { response, data } = await postAndRead(
      new Request('http://localhost:3000/api/settings/notifications', {
        method: 'POST',
        body: 'invalid json',
      })
    );

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON' });
  });

  it.each([
    ['userId', { ...samplePreferences, userId: 'other-user' }],
    ['tenantId', { ...samplePreferences, tenantId: 'other-tenant' }],
    ['id', { ...samplePreferences, id: 'other-row' }],
  ])('refuses a body that names %s and writes nothing', async (_key, body) => {
    signInTenantMember();

    const { response, data } = await postAndRead(rawPostRequest(body));

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid preferences' });
    expectNoPreferenceWrite();
  });

  it.each([
    ['a missing preference', { ...samplePreferences, inAppAll: undefined }],
    ['a non-boolean preference', { ...samplePreferences, emailMarketing: 'yes' }],
    ['an array', [samplePreferences]],
  ])('refuses %s and writes nothing', async (_label, body) => {
    signInTenantMember();

    const { response, data } = await postAndRead(rawPostRequest(body));

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid preferences' });
    expectNoPreferenceWrite();
  });

  it('writes only the six preference columns, with identity and tenant from the session', async () => {
    signInTenantMember();
    mockSelectChain.limit.mockReturnValue([]);
    const authority = (
      await import('@interdomestik/database/testing/tenant-authority')
    ).mintTestTenantAuthority('tenant_mk');

    await upsertNotificationPreferencesCore({
      userId: 'user-123',
      authority,
      preferences: {
        ...updatedPreferences,
        userId: 'other-user',
        tenantId: 'other-tenant',
        id: 'other-row',
      } as typeof updatedPreferences,
    });

    expect(mockInsertChain.values).toHaveBeenCalledWith({
      id: 'test-id-123',
      tenantId: 'tenant_mk',
      userId: 'user-123',
      ...updatedPreferences,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });
});
