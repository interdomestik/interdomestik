import { describe, expect, it, vi } from 'vitest';
import { ROLE_AGENT, ROLE_BRANCH_MANAGER, ROLE_MEMBER, ROLE_STAFF } from './roles.core';
import { runAuthenticatedAction } from './safe-action';

// Mock auth library
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => new Headers()),
}));

import { auth } from '@/lib/auth';

describe('RBAC Invariants (assertSessionContext)', () => {
  const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>;

  it('Invariants: Staff must have NULL branchId in scope even if present in user', async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: 'staff-1',
        role: ROLE_STAFF,
        tenantId: 'tenant-1',
        branchId: 'should-be-ignored',
        agentId: null,
      },
      session: {},
    });

    const result = await runAuthenticatedAction(async ctx => {
      return ctx.scope;
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.branchId).toBeNull();
      expect(result.data?.actorAgentId).toBeNull();
    }
  });

  it('Invariants: Branch Manager MUST have branchId', async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: 'bm-1',
        role: ROLE_BRANCH_MANAGER,
        tenantId: 'tenant-1',
        branchId: null, // Missing!
        agentId: null,
      },
      session: {},
    });

    const result = await runAuthenticatedAction(async () => 'ok');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN_NO_BRANCH');
    }
  });

  it('Invariants: Agent MUST have actorAgentId derived from user.id', async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: 'agent-user-1',
        role: ROLE_AGENT,
        tenantId: 'tenant-1',
        branchId: 'opt-branch',
        agentId: 'upstream-agent', // Should be ignored for actorAgentId
      },
      session: {},
    });

    const result = await runAuthenticatedAction(async ctx => ctx.scope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.actorAgentId).toBe('agent-user-1');
      expect(result.data?.branchId).toBe('opt-branch');
    }
  });

  it('Invariants: Member has NO actorAgentId', async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: 'member-1',
        role: ROLE_MEMBER,
        tenantId: 'tenant-1',
        agentId: 'upstream-agent', // This is their assigned agent
      },
      session: {},
    });

    const result = await runAuthenticatedAction(async ctx => ctx.scope);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.actorAgentId).toBeNull();
      // But they DO have an attributed agent
      expect(result.data?.attributedAgentId).toBe('upstream-agent');
    }
  });
});
