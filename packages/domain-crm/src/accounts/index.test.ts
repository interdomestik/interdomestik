import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmAccount, CrmAccountRepository } from './repository';
import { createCrmAccount } from './mutations';

const now = '2026-05-13T18:00:00.000Z';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

class InMemoryCrmAccounts implements CrmAccountRepository {
  readonly accounts: CrmAccount[] = [];

  async createAccount(params: { account: CrmAccount }): Promise<CrmAccount> {
    this.accounts.push(params.account);
    return params.account;
  }

  async findAccountById(params: { accountId: string }): Promise<CrmAccount | null> {
    return this.accounts.find(account => account.id === params.accountId) ?? null;
  }
}

describe('CRM accounts domain', () => {
  it('creates a tenant and branch scoped account with deterministic services', async () => {
    const repository = new InMemoryCrmAccounts();
    const ids = { accountId: vi.fn(() => 'account-1') };

    await expect(
      createCrmAccount(
        {
          actor: agentActor,
          name: 'Crystal Home LLC',
          ownerAgentId: 'agent-1',
          tenantId: 'tenant-1',
          website: 'https://crystal.example',
        },
        repository,
        { clock: { now: () => now }, ids }
      )
    ).resolves.toEqual({
      account: {
        archivedAt: null,
        archivedById: null,
        branchId: 'branch-1',
        createdAt: now,
        id: 'account-1',
        name: 'Crystal Home LLC',
        ownerAgentId: 'agent-1',
        tenantId: 'tenant-1',
        updatedAt: now,
        website: 'https://crystal.example',
      },
      event: expect.objectContaining({
        aggregateId: 'account-1',
        aggregateType: 'account',
        type: 'crm.account.created',
      }),
      success: true,
    });

    expect(ids.accountId).toHaveBeenCalledOnce();
    expect(repository.accounts).toHaveLength(1);
  });

  it('suppresses account creation for wrong tenant, missing branch, and invalid name', async () => {
    for (const input of [
      { actor: agentActor, name: 'Wrong tenant', tenantId: 'tenant-2' },
      {
        actor: { ...agentActor, scope: { agentId: 'agent-1' } },
        name: 'Missing branch',
        tenantId: 'tenant-1',
      },
      { actor: agentActor, name: ' ', tenantId: 'tenant-1' },
    ]) {
      const repository = new InMemoryCrmAccounts();
      const result = await createCrmAccount(input, repository, {
        clock: { now: () => now },
        ids: { accountId: () => 'account-1' },
      });

      expect(result.success).toBe(false);
      expect(repository.accounts).toHaveLength(0);
    }
  });
});
