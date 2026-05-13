import type { ConvertibleCrmLead, CrmLeadConversion, CrmLeadConversionDestination } from './types';

export type { CrmLeadConversion, CrmLeadConversionDestination };

export interface CrmLeadConversionRepository {
  appendLeadConversion(params: { conversion: CrmLeadConversion }): Promise<CrmLeadConversion>;
  findConversionByLeadId(params: {
    leadId: string;
    tenantId?: string;
  }): Promise<CrmLeadConversion | null>;
  findConversionDestination(params: {
    accountId: string;
    contactId: string;
    tenantId?: string;
  }): Promise<CrmLeadConversionDestination>;
  findLeadById(params: { leadId: string; tenantId?: string }): Promise<ConvertibleCrmLead | null>;
}
