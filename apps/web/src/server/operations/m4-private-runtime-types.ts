import type { M4OpsResponse } from './m4-ops-controller';
import type { M4Response, LegacyResult, StaffResult } from './m4-assignment-wire';

export type M4PrivateRuntimeConfiguration = Readonly<{
  identityDatabaseURL: string;
  dataDatabaseURL: string;
  issuerBaseURL: string;
  issuerSecret: string;
  operationDeadlineMs: number;
}>;
export type M4PrivateRuntime = Readonly<{
  execute(cookie: unknown, serialized: unknown): Promise<M4OpsResponse>;
  close(): Promise<void>;
}>;
export type M4PrivateAssignmentRuntimeConfiguration = M4PrivateRuntimeConfiguration &
  Readonly<{
    notificationDatabaseURL: string;
    notificationDatabaseDeadlineMs: number;
  }>;
export type M4PrivateAssignmentRuntime = M4PrivateRuntime &
  Readonly<{
    executeLegacyAdmin(
      cookie: unknown,
      serialized: unknown,
      observation: unknown
    ): Promise<M4Response<LegacyResult>>;
    executeLegacyAgent(
      cookie: unknown,
      serialized: unknown,
      observation: unknown
    ): Promise<M4Response<LegacyResult>>;
    executeStaff(
      cookie: unknown,
      serialized: unknown,
      observation: unknown
    ): Promise<M4Response<StaffResult>>;
  }>;
