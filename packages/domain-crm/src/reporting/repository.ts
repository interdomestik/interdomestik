import type {
  CrmAgentLeaderboardRow,
  CrmFunnelConversionRow,
  CrmForecastSnapshotRow,
  CrmReportingBaseInput,
  CrmSourceBreakdownRow,
  CrmStageVelocityRow,
  CrmWeightedPipelineRow,
  CrmWinRateRow,
} from './types';

export type CrmPipelineSnapshotRecord = CrmForecastSnapshotRow & {
  id: string;
  snapshotVersion: number;
};

export type CrmPipelineSnapshotInsertResult =
  | { success: true; snapshots: CrmPipelineSnapshotRecord[] }
  | { success: false; reason: 'version_conflict' };

export interface CrmReportingRepository {
  listAgentLeaderboardRows(
    input: CrmReportingBaseInput
  ): Promise<readonly CrmAgentLeaderboardRow[]>;
  listFunnelConversionRows(
    input: CrmReportingBaseInput
  ): Promise<readonly CrmFunnelConversionRow[]>;
  listSourceBreakdownRows(input: CrmReportingBaseInput): Promise<readonly CrmSourceBreakdownRow[]>;
  listStageVelocityRows(input: CrmReportingBaseInput): Promise<readonly CrmStageVelocityRow[]>;
  listWeightedPipelineRows(
    input: CrmReportingBaseInput
  ): Promise<readonly CrmWeightedPipelineRow[]>;
  listWinRateRows(input: CrmReportingBaseInput): Promise<readonly CrmWinRateRow[]>;
}

export interface CrmForecastSnapshotRepository {
  insertPipelineSnapshots(params: {
    snapshots: readonly CrmForecastSnapshotRow[];
  }): Promise<CrmPipelineSnapshotInsertResult>;
  listLatestPipelineSnapshots(params: {
    branchId?: string | null;
    pipelineId?: string | null;
    snapshotDate: string;
    tenantId: string;
  }): Promise<readonly CrmPipelineSnapshotRecord[]>;
}
