export const CRM_DEAL_FORECAST_CATEGORIES = [
  'pipeline',
  'best',
  'commit',
  'omitted',
  'closed',
] as const;
export type CrmDealForecastCategory = (typeof CRM_DEAL_FORECAST_CATEGORIES)[number];

export type CrmDeal = {
  accountId: string;
  agentId: string;
  archivedAt?: string | null;
  archivedById?: string | null;
  branchId: string;
  closedAt?: string | null;
  contactId?: string | null;
  createdAt: string;
  currencyCode: string;
  currentStageId: string;
  expectedCloseAt?: string | null;
  forecastCategory: CrmDealForecastCategory;
  id: string;
  lossReasonId?: string | null;
  pipelineId: string;
  tenantId: string;
  updatedAt: string;
  valueAmountMinor: number;
};

export type CrmDealStageHistory = {
  actorId: string;
  createdAt: string;
  dealId: string;
  fromStageId: string | null;
  id: string;
  lossReasonId?: string | null;
  reason?: string | null;
  tenantId: string;
  toStageId: string;
};

export type CrmDealReference = {
  archivedAt?: string | null;
  branchId: string;
  id: string;
  tenantId: string;
};

export type CrmDealReferenceSnapshot = {
  account: CrmDealReference | null;
  contact?: CrmDealReference | null;
};

export type CrmLossReason = {
  code: string;
  id: string;
  tenantId: string;
};
