import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The wrapper's own job: read the authorized request, delegate to the domain command (which owns
// the role, lead-access and mapping rules, tested in `domain-activities`), and revalidate the
// lead page only after a successful write.
const mocks = vi.hoisted(() => ({
  domain: vi.fn(),
  revalidatePath: vi.fn(),
  getAuthorizedActivityRequest: vi.fn(),
}));

vi.mock('@interdomestik/domain-activities/log-lead', () => ({
  logLeadActivityCore: (...args: unknown[]) => mocks.domain(...args),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));
vi.mock('./context', () => ({
  getAuthorizedActivityRequest: () => mocks.getAuthorizedActivityRequest(),
}));

import { logLeadActivityCore } from './log-lead';

const data = { leadId: 'lead-1', type: 'other' as const, subject: 'Follow-up' };

describe('logLeadActivityCore (web wrapper)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses without a session and never reaches the domain command', async () => {
    mocks.getAuthorizedActivityRequest.mockResolvedValue({ session: null, authority: null });

    await expect(logLeadActivityCore(data)).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expect(mocks.domain).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('passes the session and its authority to the domain command and revalidates on success', async () => {
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_mk' } };
    const authority = mintTestTenantAuthority('tenant_mk', { userId: 'agent-1', role: 'agent' });
    mocks.getAuthorizedActivityRequest.mockResolvedValue({ session, authority });
    mocks.domain.mockResolvedValue({ success: true, error: undefined });

    await expect(logLeadActivityCore(data)).resolves.toEqual({ success: true, error: undefined });
    expect(mocks.domain).toHaveBeenCalledWith({ session, authority, data });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/agent/crm/leads/lead-1');
  });

  it('returns a refusal unchanged and does not revalidate', async () => {
    mocks.getAuthorizedActivityRequest.mockResolvedValue({
      session: { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_mk' } },
      authority: mintTestTenantAuthority('tenant_mk', { userId: 'agent-1', role: 'agent' }),
    });
    mocks.domain.mockResolvedValue({ success: false, error: 'Lead access denied' });

    await expect(logLeadActivityCore(data)).resolves.toEqual({
      success: false,
      error: 'Lead access denied',
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
