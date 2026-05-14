import type { CrmPipeline } from '../pipelines/repository';
import type { CrmDeal, CrmDealReferenceSnapshot, CrmDealStageHistory } from './types';

export type CrmDealWithStageHistory = {
  deal: CrmDeal;
  history: CrmDealStageHistory;
};

export type CrmDealRepositoryFailureReason = 'invalid_currency' | 'stage_drift';

export class CrmDealRepositoryFailure extends Error {
  readonly reason: CrmDealRepositoryFailureReason;

  constructor(reason: CrmDealRepositoryFailureReason) {
    super(`CRM deal repository rejected write: ${reason}`);
    this.name = 'CrmDealRepositoryFailure';
    this.reason = reason;
  }
}

export type {
  CrmDeal,
  CrmDealForecastCategory,
  CrmDealReference,
  CrmDealReferenceSnapshot,
  CrmDealStageHistory,
  CrmLossReason,
} from './types';

export interface CrmDealRepository {
  createDealWithStageHistory(params: {
    deal: CrmDeal;
    history: CrmDealStageHistory;
  }): Promise<CrmDealWithStageHistory>;
  findDealById(params: { dealId: string; tenantId: string }): Promise<CrmDeal | null>;
  findPipelineById(params: { pipelineId: string; tenantId: string }): Promise<CrmPipeline | null>;
  findReferenceSnapshot(params: {
    accountId: string;
    contactId?: string | null;
    tenantId: string;
  }): Promise<CrmDealReferenceSnapshot>;
  updateDeal(params: { deal: CrmDeal }): Promise<CrmDeal>;
  updateDealWithStageHistory(params: {
    deal: CrmDeal;
    history: CrmDealStageHistory;
  }): Promise<CrmDealWithStageHistory>;
}
