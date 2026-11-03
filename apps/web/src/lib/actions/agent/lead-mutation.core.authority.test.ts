import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createCrmLead: vi.fn(),
  createCrmLeadMutationRepository: vi.fn(),
  recordCrmLeadActivity: vi.fn(),
  repository: { marker: 'lead-mutation-repository' },
  updateCrmLeadStage: vi.fn(),
}));

vi.mock('@/adapters/crm/lead-mutation-repository', () => ({
  createCrmLeadMutationRepository: hoisted.createCrmLeadMutationRepository,
}));

vi.mock('@interdomestik/domain-crm/leads/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-crm/leads/mutations')>()),
  createCrmLead: hoisted.createCrmLead,
  recordCrmLeadActivity: hoisted.recordCrmLeadActivity,
  updateCrmLeadStage: hoisted.updateCrmLeadStage,
}));

import { createLeadCore } from './create-lead.core';
import { logActivityCore } from './log-activity.core';
import { updateLeadStatusCore } from './update-lead-status.core';

const authority = mintTestTenantAuthority('tenant-1');
const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function leadForm(): FormData {
  const form = new FormData();
  form.set('type', 'individual');
  form.set('stage', 'new');
  form.set('fullName', 'Lead One');
  form.set('phone', '+38970000000');
  form.set('source', 'website');
  return form;
}

describe('agent lead mutation cores run under the session tenant authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createCrmLeadMutationRepository.mockReturnValue(hoisted.repository);
    hoisted.createCrmLead.mockResolvedValue({ success: true });
    hoisted.recordCrmLeadActivity.mockResolvedValue({ success: true });
    hoisted.updateCrmLeadStage.mockResolvedValue({ success: true });
  });

  it('creates leads through a repository bound to the authority', async () => {
    const result = await createLeadCore(actor, authority, leadForm());

    expect(result).toMatchObject({ ok: true });
    expect(hoisted.createCrmLeadMutationRepository).toHaveBeenCalledTimes(1);
    expect(hoisted.createCrmLeadMutationRepository.mock.calls[0][0]).toBe(authority);
    expect(hoisted.createCrmLead.mock.calls[0][1]).toBe(hoisted.repository);
  });

  it('logs activities through a repository bound to the authority', async () => {
    const result = await logActivityCore(actor, authority, 'lead-1', 'call', 'Called the lead');

    expect(result).toEqual({ success: true });
    expect(hoisted.createCrmLeadMutationRepository.mock.calls[0][0]).toBe(authority);
    expect(hoisted.recordCrmLeadActivity.mock.calls[0][1]).toBe(hoisted.repository);
  });

  it('updates lead stages through a repository bound to the authority', async () => {
    const result = await updateLeadStatusCore(actor, authority, 'lead-1', 'contacted');

    expect(result).toEqual({ success: true });
    expect(hoisted.createCrmLeadMutationRepository.mock.calls[0][0]).toBe(authority);
    expect(hoisted.updateCrmLeadStage.mock.calls[0][1]).toBe(hoisted.repository);
  });

  it('builds no repository, and so reaches no client, when validation fails first', async () => {
    const result = await createLeadCore(actor, authority, new FormData());

    expect(result).toMatchObject({ ok: false, error: 'Validation failed' });
    expect(hoisted.createCrmLead).not.toHaveBeenCalled();
  });
});
