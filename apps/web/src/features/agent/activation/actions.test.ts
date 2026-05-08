import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  activateAgentUserProfile: vi.fn(),
  authGetSession: vi.fn(),
  ensureTenantId: vi.fn(),
  headers: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.authGetSession,
    },
  },
}));

vi.mock('@/features/agent/activation/server/activate-agent-profile', () => ({
  activateAgentUserProfile: hoisted.activateAgentUserProfile,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headers,
}));

import { activateAgentProfile } from './actions';

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.headers.mockResolvedValue(new Headers());
  hoisted.authGetSession.mockResolvedValue({
    user: {
      id: 'member-1',
      name: 'Arben Lila',
      role: 'member',
      tenantId: 'tenant-1',
    },
  });
  hoisted.ensureTenantId.mockReturnValue('tenant-1');
  hoisted.activateAgentUserProfile.mockResolvedValue(undefined);
});

describe('activateAgentProfile', () => {
  it('rejects unauthenticated activation before mutation', async () => {
    hoisted.authGetSession.mockResolvedValueOnce(null);

    await expect(activateAgentProfile()).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });

    expect(hoisted.activateAgentUserProfile).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it('updates only the authenticated user profile', async () => {
    await expect(activateAgentProfile()).resolves.toEqual({
      success: true,
      referralCode: expect.stringMatching(/^ARBEN-[0-9A-F]{4}$/),
    });

    expect(hoisted.activateAgentUserProfile).toHaveBeenCalledWith({
      currentRole: 'member',
      referralCode: expect.stringMatching(/^ARBEN-[0-9A-F]{4}$/),
      tenantId: 'tenant-1',
      userId: 'member-1',
    });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('is idempotent for an existing agent and performs no mutation', async () => {
    hoisted.authGetSession.mockResolvedValueOnce({
      user: {
        id: 'agent-1',
        name: 'Existing Agent',
        role: 'agent',
        referralCode: 'EXISTING-1234',
      },
    });

    await expect(activateAgentProfile()).resolves.toEqual({
      success: true,
      referralCode: 'EXISTING-1234',
      alreadyActive: true,
    });

    expect(hoisted.activateAgentUserProfile).not.toHaveBeenCalled();
  });
});
