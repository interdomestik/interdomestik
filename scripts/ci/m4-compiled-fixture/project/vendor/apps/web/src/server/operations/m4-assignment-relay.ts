import { randomUUID } from 'node:crypto';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';
import fs from 'node:fs';
import { relayM4AssignmentRequest } from './m4-assignment-relay-client';
import type { M4RelayProfile } from './m4-assignment-relay-wire';
import type { LegacyResult, StaffResult, M4Response } from './m4-assignment-wire';
export type M4AssignmentRelayInput = Readonly<{
  claimId: string;
  staffId?: string | null;
  requestHeaders: Headers;
  operationId?: string;
}>;
function readPublicCA(file: string): string {
  if (fs.realpathSync(file) !== file) throw new Error('Fixed assignment CA path required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.uid !== process.getuid?.() ||
      before.mode & 0o022 ||
      before.size < 1 ||
      before.size > 65536
    )
      throw new Error('Bounded owned assignment CA required');
    const bytes = Buffer.alloc(before.size + 1),
      read = fs.readSync(fd, bytes, 0, bytes.length, 0),
      after = fs.fstatSync(fd);
    if (
      read !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      after.mode !== before.mode ||
      fs.realpathSync(file) !== file
    )
      throw new Error('Assignment CA changed during capture');
    return bytes.subarray(0, read).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}
async function relay(profile: M4RelayProfile, input: M4AssignmentRelayInput) {
  if (
    !input ||
    typeof input.claimId !== 'string' ||
    (input.staffId !== undefined && input.staffId !== null && typeof input.staffId !== 'string') ||
    (input.operationId !== undefined && typeof input.operationId !== 'string')
  )
    return { status: 'denied' as const, reason: 'INVALID_REQUEST' as const };
  // One identity per invocation; transport never retries or generates a replacement identity.
  const operationId = input.operationId === undefined ? randomUUID() : input.operationId;
  const serialized = JSON.stringify({
    version: 1,
    command: profile === 'staff' ? 'm4.staff.assign-claim' : 'm4.legacy.assign-claim',
    operationId,
    claimId: input.claimId,
    ...(input.staffId === undefined ? {} : { staffId: input.staffId }),
  });
  if (!parseM4AssignmentRequest(serialized))
    return { status: 'denied' as const, reason: 'INVALID_REQUEST' as const };
  const observation = JSON.stringify({
    ip: input.requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 256) ?? null,
    userAgent: input.requestHeaders.get('user-agent')?.slice(0, 1024) ?? null,
  });
  try {
    const caFile = process.env.M4_ASSIGNMENT_OWNER_CA_FILE;
    const configuration = {
      origin: process.env.M4_ASSIGNMENT_OWNER_ORIGIN ?? '',
      deadlineMs: Number(process.env.M4_ASSIGNMENT_RELAY_DEADLINE_MS),
      ...(caFile ? { ca: readPublicCA(caFile) } : {}),
    };
    return await relayM4AssignmentRequest(
      configuration,
      profile,
      input.requestHeaders.get('cookie') ?? '',
      serialized,
      observation
    );
  } catch {
    return { status: 'indeterminate' as const, operationId };
  }
}
export const relayLegacyAdminAssignment = (input: M4AssignmentRelayInput) =>
  relay('legacy-admin', input) as Promise<M4Response<LegacyResult>>;
export const relayLegacyAgentAssignment = (input: M4AssignmentRelayInput) =>
  relay('legacy-agent', input) as Promise<M4Response<LegacyResult>>;
export const relayStaffAssignment = (input: M4AssignmentRelayInput) =>
  relay('staff', input) as Promise<M4Response<StaffResult>>;
// A transport uncertainty is never a completed business result or a signal to retry a fresh ID.
export function assignmentRelayFailure(
  response: Exclude<M4Response<unknown>, { status: 'completed' }>,
  profile: 'legacy-admin' | 'legacy-agent' | 'staff'
) {
  if (response.status === 'indeterminate')
    return {
      success: false as const,
      error: 'Assignment outcome uncertain; retain operation identity before retrying',
      ...(profile === 'staff' ? {} : { data: undefined }),
      status: 'indeterminate' as const,
      operationId: response.operationId,
    };
  const error =
    response.reason === 'UNAUTHORIZED'
      ? 'Unauthorized'
      : response.reason === 'SELF_ASSIGNMENT_ONLY'
        ? 'Access denied: Cannot assign other staff'
        : response.reason === 'RESOURCE_DENIED'
          ? profile === 'staff'
            ? 'Claim not found or access denied'
            : 'Claim not found'
          : response.reason === 'OPERATION_CONFLICT'
            ? 'Assignment operation conflicts with an existing request'
            : 'Invalid assignment request';
  return { success: false as const, error, ...(profile === 'staff' ? {} : { data: undefined }) };
}
