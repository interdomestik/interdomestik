import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { ROLES } from '@interdomestik/shared-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeChargeAction, closeHandoverAction, recordEvidenceAction } from './actions';
import { loadSponsorTasks } from './tasks.core';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  evidence: vi.fn(),
  close: vi.fn(),
  acknowledge: vi.fn(),
  credential: vi.fn(),
  client: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@interdomestik/database/tenant-authority', async original => ({
  ...(await original<typeof import('@interdomestik/database/tenant-authority')>()),
  readTenantAuthority: mocks.read,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/staff-tasks', () => ({
  listSponsorStaffTasks: mocks.list,
  acknowledgeHandoverCharge: mocks.acknowledge,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/handover-staff', () => ({
  recordHandoverEvidence: mocks.evidence,
  closeHandoverByStaff: mocks.close,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/sponsor-jobs', () => ({
  sponsorCredentialCheck: mocks.credential,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsors/paddle-handover-client', () => ({
  createHandoverPaddleClient: mocks.client,
}));

const authority = mintTestTenantAuthority('tenant-1');
const actor = { userId: 'staff-1', role: ROLES.staff, branchId: 'branch-1', agentTier: null };
const hasCredential = vi.fn();
const client = { getSubscription: vi.fn() };
const entries = [
  {
    name: 'evidence',
    action: recordEvidenceAction,
    domain: mocks.evidence,
    input: { intentId: 'intent-1', paidUntil: '2026-12-01T12:30:00Z', evidenceId: 'txn_abc123' },
  },
  {
    name: 'close',
    action: closeHandoverAction,
    domain: mocks.close,
    input: { intentId: 'intent-1', disposition: 'canceled' },
  },
  {
    name: 'acknowledge',
    action: acknowledgeChargeAction,
    domain: mocks.acknowledge,
    input: { chargeId: 'charge-1' },
  },
];
function form(input: object): FormData {
  const data = new FormData();
  Object.entries(input).forEach(([key, value]) => data.set(key, String(value)));
  return data;
}
function descriptor(
  role: string | null = ROLES.staff,
  branchId: string | null = 'branch-1'
): object {
  return {
    tenantId: 'tenant-1',
    accessTenantId: 'tenant-1',
    principal: { userId: 'staff-1', role, branchId },
  };
}

const HANDOVER_ROLES: readonly string[] = [
  ROLES.staff,
  ROLES.tenant_admin,
  ROLES.admin,
  ROLES.super_admin,
];

describe('staff-only sponsor reader and actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue({
      authority,
      session: { user: { id: 'staff-1', role: ROLES.staff, branchId: 'branch-1' } },
    });
    mocks.read.mockReturnValue(descriptor());
    mocks.credential.mockReturnValue(hasCredential);
    mocks.client.mockReturnValue(client);
    mocks.list.mockResolvedValue({ ok: true, value: [] });
    entries.forEach(entry => entry.domain.mockResolvedValue({ ok: true, value: {} }));
  });

  it.each([
    ...Object.values(ROLES).filter(role => !HANDOVER_ROLES.includes(role)),
    'unknown',
    '',
    null,
  ])('refuses every reader and action for non-staff role %s', async role => {
    mocks.authorize.mockResolvedValue({
      authority,
      session: { user: { id: 'staff-1', role, branchId: 'branch-1' } },
    });
    mocks.read.mockReturnValue(descriptor(role));
    expect(await loadSponsorTasks()).toEqual({ ok: false, error: 'forbidden' });
    await Promise.all(
      entries.map(async entry => {
        expect(await entry.action(form(entry.input))).toEqual({ ok: false, error: 'forbidden' });
        expect(entry.domain).not.toHaveBeenCalled();
      })
    );
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.credential).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it.each(['session', 'tenant', 'branch', 'principal', 'identity', 'accessTenant'])(
    'fails closed on missing or mismatched %s',
    async missing => {
      if (missing === 'session') mocks.authorize.mockResolvedValue(null);
      if (missing === 'tenant') mocks.authorize.mockRejectedValue(new Error('MissingTenantError'));
      if (missing === 'branch') mocks.read.mockReturnValue(descriptor(ROLES.staff, 'branch-2'));
      if (missing === 'principal')
        mocks.read.mockReturnValue({
          tenantId: 'tenant-1',
          accessTenantId: 'tenant-1',
          principal: null,
        });
      if (missing === 'identity')
        mocks.read.mockReturnValue({ ...descriptor(), principal: { ...actor, userId: 'other' } });
      if (missing === 'accessTenant')
        mocks.read.mockReturnValue({ ...descriptor(), accessTenantId: 'other' });
      expect(await loadSponsorTasks()).toEqual({ ok: false, error: 'forbidden' });
      await Promise.all(
        entries.map(async entry => {
          expect(await entry.action(form(entry.input))).toEqual({ ok: false, error: 'forbidden' });
        })
      );
      expect(mocks.list).not.toHaveBeenCalled();
      entries.forEach(entry => expect(entry.domain).not.toHaveBeenCalled());
    }
  );

  it('reads with server-minted authority and the credential checker', async () => {
    const tasks = [{ kind: 'checkout_race', subscriptionId: 'sub-1', userId: 'member-1' }];
    mocks.list.mockResolvedValue({ ok: true, value: tasks });
    expect(await loadSponsorTasks()).toEqual({ ok: true, tasks });
    expect(mocks.list).toHaveBeenCalledWith(authority, actor, { hasCredential }, expect.any(Date));
    expect(mocks.credential).toHaveBeenCalledWith(authority);
  });

  it.each([ROLES.tenant_admin, ROLES.admin, ROLES.super_admin])(
    'admits %s with its own role and refuses a session role that differs',
    async role => {
      mocks.authorize.mockResolvedValue({
        authority,
        session: { user: { id: 'staff-1', role, branchId: 'branch-1' } },
      });
      mocks.read.mockReturnValue(descriptor(role));
      expect(await loadSponsorTasks()).toEqual({ ok: true, tasks: [] });
      expect(mocks.list).toHaveBeenCalledWith(
        authority,
        { ...actor, role },
        { hasCredential },
        expect.any(Date)
      );
      mocks.read.mockReturnValue(descriptor(ROLES.staff));
      expect(await loadSponsorTasks()).toEqual({ ok: false, error: 'forbidden' });
    }
  );

  it('admits tenant-wide staff without a branch', async () => {
    mocks.authorize.mockResolvedValue({
      authority,
      session: { user: { id: 'staff-1', role: ROLES.staff } },
    });
    mocks.read.mockReturnValue(descriptor(ROLES.staff, null));
    expect(await loadSponsorTasks()).toEqual({ ok: true, tasks: [] });
    expect(mocks.list).toHaveBeenCalledWith(
      authority,
      { ...actor, branchId: null },
      { hasCredential },
      expect.any(Date)
    );
  });

  it.each(entries)(
    '$name rechecks authorization and calls only the designated domain action',
    async entry => {
      expect(await entry.action(form(entry.input))).toEqual({ ok: true });
      expect(mocks.authorize).toHaveBeenCalledTimes(1);
      if (entry.name === 'evidence')
        expect(entry.domain).toHaveBeenCalledWith(
          authority,
          actor,
          { hasCredential },
          { ...entry.input, paidUntil: new Date('2026-12-01T12:30:00Z'), now: expect.any(Date) }
        );
      if (entry.name === 'close') {
        expect(mocks.client).toHaveBeenCalledWith('tenant-1');
        expect(entry.domain).toHaveBeenCalledWith(authority, actor, client, {
          ...entry.input,
          now: expect.any(Date),
        });
      }
      if (entry.name === 'acknowledge')
        expect(entry.domain).toHaveBeenCalledWith(authority, actor, {
          ...entry.input,
          now: expect.any(Date),
        });
      mocks.authorize.mockResolvedValue(null);
      expect(await entry.action(form(entry.input))).toEqual({ ok: false, error: 'forbidden' });
      expect(entry.domain).toHaveBeenCalledTimes(1);
    }
  );

  it('accepts the renewing disposition and adjustment evidence', async () => {
    expect(
      await closeHandoverAction(form({ intentId: 'intent-1', disposition: 'renewing_as_member' }))
    ).toEqual({ ok: true });
    expect(
      await recordEvidenceAction(
        form({
          intentId: 'intent-1',
          paidUntil: '2026-12-01T12:30:00+01:00',
          evidenceId: 'adj_abc123',
        })
      )
    ).toEqual({ ok: true });
  });

  describe.each(entries)('$name failures', entry => {
    it.each(['forbidden', 'invalid', 'not_found', 'conflict'])(
      'preserves the mapped domain error %s',
      async error => {
        entry.domain.mockResolvedValue({ ok: false, error });
        expect(await entry.action(form(entry.input))).toEqual({ ok: false, error });
      }
    );
    it('contains unexpected failures without exposing details', async () => {
      entry.domain.mockRejectedValue(new Error('private provider detail'));
      expect(await entry.action(form(entry.input))).toEqual({ ok: false, error: 'error' });
    });
    it('rejects missing fields without a domain call', async () => {
      expect(await entry.action(new FormData())).toEqual({ ok: false, error: 'invalid' });
      expect(entry.domain).not.toHaveBeenCalled();
    });
    it('rechecks authorization and refuses malformed server-action payloads', async () => {
      expect(await entry.action(null)).toEqual({ ok: false, error: 'invalid' });
      expect(mocks.authorize).toHaveBeenCalledTimes(1);
      expect(entry.domain).not.toHaveBeenCalled();
    });
  });

  it.each([
    { intentId: 'intent-1', paidUntil: '2026-02-30T00:00:00Z', evidenceId: 'txn_abc' },
    { intentId: 'intent-1', paidUntil: '2026-12-01', evidenceId: 'txn_abc' },
    { intentId: 'intent-1', paidUntil: '2026-12-01T00:00:00Z', evidenceId: 'not-paddle' },
    { intentId: '../other', paidUntil: '2026-12-01T00:00:00Z', evidenceId: 'txn_abc' },
  ])('rejects invalid evidence %#', async input => {
    expect(await recordEvidenceAction(form(input))).toEqual({ ok: false, error: 'invalid' });
    expect(mocks.evidence).not.toHaveBeenCalled();
  });

  it('rejects arbitrary dispositions before constructing a Paddle client', async () => {
    expect(
      await closeHandoverAction(form({ intentId: 'intent-1', disposition: 'refund' }))
    ).toEqual({ ok: false, error: 'invalid' });
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it('preserves domain reader refusal and contains reader errors', async () => {
    mocks.list
      .mockResolvedValueOnce({ ok: false, error: 'forbidden' })
      .mockRejectedValueOnce(new Error('private'));
    expect(await loadSponsorTasks()).toEqual({ ok: false, error: 'forbidden' });
    expect(await loadSponsorTasks()).toEqual({ ok: false, error: 'error' });
  });
});
