import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  legacyAssign: vi.fn(),
  staffAssign: vi.fn(),
  claim: vi.fn(),
  transport: vi.fn(),
}));
vi.mock('@interdomestik/domain-claims/agent-claims/assign', () => ({
  assignClaimCore: mocks.legacyAssign,
}));
vi.mock('@interdomestik/domain-claims/staff-claims/assign', () => ({
  assignClaimCore: mocks.staffAssign,
}));
vi.mock('@interdomestik/database', () => ({
  db: { query: { claims: { findFirst: mocks.claim } } },
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ notifyClaimAssigned: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/operations/m4-assignment-relay-client', () => ({
  relayM4AssignmentRequest: mocks.transport,
}));

import { assignClaimCore as adminAssign } from '@/actions/admin-claims/assign.core';
import { assignClaimCore as agentAssign } from '@/actions/agent-claims/assign.core';
import { assignClaimCore as staffAssign } from '@/actions/staff-claims/assign.core';
import { logAuditEvent } from '@/lib/audit';
import { notifyClaimAssigned } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

describe('live assignments before the qualified owner deployment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('M4_ASSIGNMENT_OWNER_ORIGIN', undefined);
    vi.stubEnv('M4_ASSIGNMENT_RELAY_DEADLINE_MS', undefined);
    vi.stubEnv('M4_ASSIGNMENT_OWNER_CA_FILE', undefined);
    mocks.transport.mockResolvedValue({
      status: 'indeterminate',
      operationId: '11111111-1111-4111-8111-111111111111',
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  const params = () => ({
    claimId: 'claim-1',
    staffId: 'staff-1',
    session: { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' } },
    requestHeaders: new Headers({ cookie: 'original-session' }),
  });

  it('admin assignment uses the existing authorized domain path without an owner endpoint', async () => {
    const input = params() as Parameters<typeof adminAssign>[0];
    mocks.claim
      .mockResolvedValueOnce({ id: 'claim-1', staffId: 'old-staff' })
      .mockResolvedValueOnce({ staffId: 'staff-1' });
    mocks.legacyAssign.mockResolvedValue({ success: true, error: undefined });
    await expect(adminAssign(input)).resolves.toEqual({ success: true, error: undefined });
    expect(mocks.legacyAssign).toHaveBeenCalledExactlyOnceWith(input, {
      logAuditEvent,
      notifyClaimAssigned,
    });
    expect(revalidatePath).toHaveBeenCalledTimes(24);
    expect(mocks.transport).not.toHaveBeenCalled();
  });

  it('agent assignment uses the existing domain path without an owner endpoint', async () => {
    const input = params() as Parameters<typeof agentAssign>[0];
    mocks.legacyAssign.mockResolvedValue({ success: true, error: undefined });
    await expect(agentAssign(input)).resolves.toEqual({ success: true, error: undefined });
    expect(mocks.legacyAssign).toHaveBeenCalledExactlyOnceWith(input, {
      logAuditEvent,
      notifyClaimAssigned,
    });
    expect(revalidatePath).toHaveBeenCalledTimes(24);
    expect(mocks.transport).not.toHaveBeenCalled();
  });

  it('staff assignment uses the existing domain path without an owner endpoint', async () => {
    const input = params() as Parameters<typeof staffAssign>[0];
    mocks.staffAssign.mockResolvedValue({ success: true });
    await expect(staffAssign(input)).resolves.toEqual({ success: true });
    expect(mocks.staffAssign).toHaveBeenCalledExactlyOnceWith(input, { logAuditEvent });
    expect(revalidatePath).toHaveBeenCalledTimes(8);
    expect(mocks.transport).not.toHaveBeenCalled();
  });

  it('admin authorization still refuses before domain access or transport', async () => {
    const input = params();
    input.session.user.role = 'member';
    await expect(adminAssign(input as Parameters<typeof adminAssign>[0])).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
      data: undefined,
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.legacyAssign).not.toHaveBeenCalled();
    expect(mocks.transport).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
