import type { CrmPipeline } from '../pipelines/repository';
import type { CrmDeal, CrmDealReferenceSnapshot, CrmDealStageHistory } from './types';

export type {
  CrmDeal,
  CrmDealForecastCategory,
  CrmDealReference,
  CrmDealReferenceSnapshot,
  CrmDealStageHistory,
  CrmLossReason,
} from './types';

export interface CrmDealRepository {
  appendStageHistory(params: { history: CrmDealStageHistory }): Promise<CrmDealStageHistory>;
  createDeal(params: { deal: CrmDeal }): Promise<CrmDeal>;
  findDealById(params: { dealId: string; tenantId: string }): Promise<CrmDeal | null>;
  findPipelineById(params: { pipelineId: string; tenantId: string }): Promise<CrmPipeline | null>;
  findReferenceSnapshot(params: {
    accountId: string;
    contactId?: string | null;
    tenantId: string;
  }): Promise<CrmDealReferenceSnapshot>;
  updateDeal(params: { deal: CrmDeal }): Promise<CrmDeal>;
}
