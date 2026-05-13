import type { CrmAccountContact, CrmContact, CrmContactRepositoryAccount } from './types';

export type { CrmAccountContact, CrmContact, CrmContactRepositoryAccount };

export interface CrmContactRepository {
  createContact(params: { contact: CrmContact }): Promise<CrmContact>;
  findAccountById(params: {
    accountId: string;
    tenantId?: string;
  }): Promise<CrmContactRepositoryAccount | null>;
  findContactById(params: { contactId: string; tenantId?: string }): Promise<CrmContact | null>;
  linkContactToAccount(params: { accountContact: CrmAccountContact }): Promise<CrmAccountContact>;
}
