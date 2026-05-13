import type { CrmAccount } from './types';

export type { CrmAccount };

export interface CrmAccountRepository {
  createAccount(params: { account: CrmAccount }): Promise<CrmAccount>;
  findAccountById(params: { accountId: string; tenantId?: string }): Promise<CrmAccount | null>;
}
