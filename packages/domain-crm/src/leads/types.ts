export type CrmLead = {
  id: string;
  tenantId: string;
  agentId: string;
  branchId?: string | null;
  type: string;
  stage: string;
  companyName?: string | null;
  email?: string | null;
  fullName?: string | null;
  notes?: string | null;
  phone?: string | null;
  source?: string | null;
  score?: number | null;
  createdAt: string;
  updatedAt?: string | null;
};

export type CrmLeadActivity = {
  id: string;
  tenantId: string;
  leadId: string;
  agentId: string;
  type: string;
  subject: string;
  description?: string | null;
  occurredAt: string;
  createdAt: string;
  completedAt?: string | null;
  scheduledAt?: string | null;
};
