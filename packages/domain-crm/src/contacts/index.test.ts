import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type {
  CrmAccountContact,
  CrmContact,
  CrmContactRepository,
  CrmContactRepositoryAccount,
} from './repository';
import { createCrmContact, linkCrmContactToAccount } from './mutations';

const now = '2026-05-13T18:15:00.000Z';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function account(
  overrides: Partial<CrmContactRepositoryAccount> = {}
): CrmContactRepositoryAccount {
  return {
    archivedAt: null,
    branchId: 'branch-1',
    id: 'account-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

class InMemoryCrmContacts implements CrmContactRepository {
  readonly accountContacts: CrmAccountContact[] = [];
  readonly accounts = new Map<string, CrmContactRepositoryAccount>([['account-1', account()]]);
  readonly contacts: CrmContact[] = [];

  async createContact(params: { contact: CrmContact }): Promise<CrmContact> {
    this.contacts.push(params.contact);
    return params.contact;
  }

  async findAccountById(params: {
    accountId: string;
  }): Promise<CrmContactRepositoryAccount | null> {
    return this.accounts.get(params.accountId) ?? null;
  }

  async findContactById(params: { contactId: string }): Promise<CrmContact | null> {
    return this.contacts.find(contact => contact.id === params.contactId) ?? null;
  }

  async linkContactToAccount(params: {
    accountContact: CrmAccountContact;
  }): Promise<CrmAccountContact> {
    this.accountContacts.push(params.accountContact);
    return params.accountContact;
  }
}

describe('CRM contacts domain', () => {
  it('creates a tenant and branch scoped contact with deterministic services', async () => {
    const repository = new InMemoryCrmContacts();
    const ids = { contactId: vi.fn(() => 'contact-1') };

    await expect(
      createCrmContact(
        {
          actor: agentActor,
          email: 'elira@example.com',
          fullName: 'Elira Krasniqi',
          phone: '+38344123123',
          tenantId: 'tenant-1',
        },
        repository,
        { clock: { now: () => now }, ids }
      )
    ).resolves.toMatchObject({
      contact: {
        archivedAt: null,
        branchId: 'branch-1',
        email: 'elira@example.com',
        fullName: 'Elira Krasniqi',
        id: 'contact-1',
        tenantId: 'tenant-1',
      },
      event: { aggregateId: 'contact-1', type: 'crm.contact.created' },
      success: true,
    });

    expect(ids.contactId).toHaveBeenCalledOnce();
    expect(repository.contacts).toHaveLength(1);
  });

  it('links same-tenant account and contact with role and primary metadata', async () => {
    const repository = new InMemoryCrmContacts();
    repository.contacts.push({
      archivedAt: null,
      archivedById: null,
      branchId: 'branch-1',
      createdAt: now,
      email: 'owner@example.com',
      fullName: 'Owner Contact',
      id: 'contact-1',
      tenantId: 'tenant-1',
      updatedAt: now,
    });

    await expect(
      linkCrmContactToAccount(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: 'contact-1',
          isPrimary: true,
          relationshipId: 'account-contact-1',
          role: 'decision_maker',
        },
        repository,
        { clock: { now: () => now } }
      )
    ).resolves.toEqual({
      accountContact: {
        accountId: 'account-1',
        contactId: 'contact-1',
        createdAt: now,
        id: 'account-contact-1',
        isPrimary: true,
        role: 'decision_maker',
        tenantId: 'tenant-1',
      },
      success: true,
    });
  });

  it('suppresses account-contact links for cross-tenant and archived destinations', async () => {
    for (const [currentAccount, expectedReason] of [
      [account({ tenantId: 'tenant-2' }), 'tenant_scope'],
      [account({ archivedAt: '2026-05-13T18:20:00.000Z' }), 'archived_destination'],
    ] as const) {
      const repository = new InMemoryCrmContacts();
      repository.accounts.set('account-1', currentAccount);
      repository.contacts.push({
        archivedAt: null,
        archivedById: null,
        branchId: 'branch-1',
        createdAt: now,
        fullName: 'Contact One',
        id: 'contact-1',
        tenantId: 'tenant-1',
        updatedAt: now,
      });

      const result = await linkCrmContactToAccount(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: 'contact-1',
          relationshipId: 'account-contact-1',
          role: 'influencer',
        },
        repository,
        { clock: { now: () => now } }
      );

      expect(result.success).toBe(false);
      expect(result).toMatchObject({ error: 'forbidden', reason: expectedReason });
      expect(repository.accountContacts).toHaveLength(0);
    }
  });
});
