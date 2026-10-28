import type { M4AssignmentProfile } from './m4-private-runtime-types';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
import {
  parseM4AssignmentObservation,
  type M4Response,
  type AssignmentResult,
} from './m4-assignment-wire';
// Pure command/option preparation. No pool, timer, owner or authority is created here.
export function prepareM4RuntimeCommand(
  profile: M4AssignmentProfile,
  serialized: unknown,
  observation: unknown
) {
  const request = parseM4AssignmentRequest(serialized);
  if (
    !request ||
    request.command !==
      (profile === 'ops'
        ? 'm4.ops.assign-owner'
        : profile === 'staff'
          ? 'm4.staff.assign-claim'
          : 'm4.legacy.assign-claim') ||
    (profile !== 'ops' && !parseM4AssignmentObservation(observation))
  )
    return null;
  const uncertain: M4Response<AssignmentResult> = {
    status: 'indeterminate',
    operationId: request.operationId,
  };
  return { request, uncertain };
}
export function captureM4ConnectionOptions(deadlineMs: number) {
  const connection = {
    statement_timeout: deadlineMs,
    lock_timeout: deadlineMs,
    idle_in_transaction_session_timeout: deadlineMs,
    // A server blocked on a lock must also notice our destroyed client socket.
    // This is not a guarantee of bounded detection under arbitrary network failure.
    client_connection_check_interval: 100,
    search_path: 'pg_catalog, public',
    row_security: 'on',
  };
  return connection;
}
