import { describe, expect, it } from 'vitest';

import {
  canDecideRevision,
  canManageHandover,
  canManageRoster,
  canManageSponsor,
  type SponsorActor,
} from './access';

const scope = { ownerAgentId: 'agent-1', branchId: 'branch-1' };
const actor = (role: string, extra: Partial<SponsorActor> = {}): SponsorActor => ({
  userId: `${role}-1`,
  role,
  branchId: null,
  agentTier: null,
  ...extra,
});

describe('sponsor access', () => {
  it('lets the owning office agent, the branch manager and staff manage a sponsor', () => {
    expect(canManageSponsor(actor('agent', { agentTier: 'office' }), scope)).toBe(true);
    expect(canManageSponsor(actor('branch_manager', { branchId: 'branch-1' }), scope)).toBe(true);
    for (const role of ['staff', 'tenant_admin', 'admin', 'super_admin']) {
      expect(canManageSponsor(actor(role), scope)).toBe(true);
    }
  });

  it('fails closed for other agents, branches and read-only roles', () => {
    expect(canManageSponsor(actor('agent', { agentTier: 'standard' }), scope)).toBe(false);
    expect(
      canManageSponsor(actor('agent', { userId: 'agent-2', agentTier: 'office' }), scope)
    ).toBe(false);
    expect(canManageSponsor(actor('branch_manager', { branchId: 'branch-2' }), scope)).toBe(false);
    expect(canManageSponsor(actor('branch_manager'), scope)).toBe(false);
    for (const role of ['auditor', 'global_support', 'member', 'unknown']) {
      expect(canManageSponsor(actor(role), scope)).toBe(false);
    }
  });

  it('allows roster changes only on an effective term', () => {
    expect(canManageRoster(actor('staff'), scope, true)).toBe(true);
    expect(canManageRoster(actor('staff'), scope, false)).toBe(false);
  });

  it('reserves decisions and handovers for staff, never the creator', () => {
    expect(canDecideRevision(actor('staff'), 'agent-1')).toBe(true);
    expect(canDecideRevision(actor('staff'), 'staff-1')).toBe(false);
    expect(canDecideRevision(actor('branch_manager', { branchId: 'branch-1' }), 'x')).toBe(false);
    expect(canManageHandover(actor('admin'))).toBe(true);
    expect(canManageHandover(actor('agent', { agentTier: 'office' }))).toBe(false);
  });
});
