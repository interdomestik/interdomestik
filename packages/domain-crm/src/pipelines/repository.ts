import type { CrmPipeline } from './types';

export type { CrmPipeline, CrmPipelineStage, CrmPipelineStageInput } from './types';

export interface CrmPipelineRepository {
  createPipeline(params: { pipeline: CrmPipeline }): Promise<CrmPipeline>;
  findPipelineById(params: { pipelineId: string; tenantId: string }): Promise<CrmPipeline | null>;
  updatePipeline(params: { pipeline: CrmPipeline }): Promise<CrmPipeline>;
}
