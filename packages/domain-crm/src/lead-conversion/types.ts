import type { CrmLead } from '../leads/types';

export type CrmLeadConversionDestinationAccount = {
  archivedAt?: string | null;
  branchId?: string | null;
  id: string;
  tenantId: string;
};

export type CrmLeadConversionDestinationContact = {
  archivedAt?: string | null;
  branchId?: string | null;
  id: string;
  tenantId: string;
};

export type CrmLeadConversionDestination = {
  account: CrmLeadConversionDestinationAccount | null;
  contact: CrmLeadConversionDestinationContact | null;
};

export type CrmLeadConversion = {
  accountId: string;
  actorId: string;
  branchId: string;
  contactId: string;
  convertedAt: string;
  id: string;
  leadId: string;
  reason?: string | null;
  tenantId: string;
};

export type ConvertibleCrmLead = Pick<
  CrmLead,
  'agentId' | 'branchId' | 'id' | 'lostAt' | 'stage' | 'tenantId' | 'wonAt'
>;
