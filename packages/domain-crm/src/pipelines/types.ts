export type CrmPipelineStage = {
  expectedDurationDays?: number | null;
  id: string;
  isLost: boolean;
  isWon: boolean;
  name: string;
  order: number;
  pipelineId: string;
  probability: number;
  tenantId: string;
};

export type CrmPipeline = {
  archivedAt?: string | null;
  archivedById?: string | null;
  branchId?: string | null;
  createdAt: string;
  id: string;
  name: string;
  stages: readonly CrmPipelineStage[];
  tenantId: string;
  updatedAt: string;
};

export type CrmPipelineStageInput = {
  expectedDurationDays?: number | null;
  isLost?: boolean;
  isWon?: boolean;
  name: string;
  order: number;
  probability: number;
};
