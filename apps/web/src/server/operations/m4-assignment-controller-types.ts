import type * as schema from '@interdomestik/database/schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { CurrentOperationPrincipal } from '../../lib/auth/current-store-session';
import type { M4AssignmentPostcommitNotifier } from './m4-assignment-postcommit';
import type { M4Response, OpsResult } from './m4-assignment-wire';

// Existing ops wire type/factory signature remains unchanged. Other fixed entry wire results
// include only a changed bit for the source-bound cache adapter, never notification/user data.
export type OpsResponse =
  | { status: 'completed'; operationId: string; replayed: boolean; result: OpsResult }
  | {
      status: 'denied';
      reason: 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'RESOURCE_DENIED' | 'OPERATION_CONFLICT';
    }
  | { status: 'indeterminate'; operationId: string };
export type Configuration = {
  database: PostgresJsDatabase<typeof schema>;
  verifySession: (cookie: unknown) => Promise<CurrentOperationPrincipal | null>;
};
export type LegacyConfiguration = Configuration & {
  assignmentNotifier: M4AssignmentPostcommitNotifier;
};
export type Profile = 'ops' | 'legacy-admin' | 'legacy-agent' | 'staff';
export type OpsExecutor = (cookie: unknown, serialized: unknown) => Promise<OpsResponse>;
export type ProfileExecutor<R> = (
  cookie: unknown,
  serialized: unknown,
  observation: unknown
) => Promise<M4Response<R>>;
