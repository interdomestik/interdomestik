import type { CrmActorContext } from '../context';
import type { CrmLead, CrmLeadActivity } from './types';

export type CrmLeadRepositoryLookup = {
  actor: CrmActorContext;
  leadId: string;
};

export type CrmLeadActivityRepositoryLookup = {
  actor: CrmActorContext;
  leadId: string;
  limit?: number;
};

export interface CrmLeadRepository {
  findById(params: CrmLeadRepositoryLookup): Promise<CrmLead | null>;
  listActivitiesForLead(params: CrmLeadActivityRepositoryLookup): Promise<CrmLeadActivity[]>;
}
