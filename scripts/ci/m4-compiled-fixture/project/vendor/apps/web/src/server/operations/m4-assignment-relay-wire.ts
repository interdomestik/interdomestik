import { createHash } from 'node:crypto';
import { parseM4AssignmentRequest, type M4AssignmentRequest } from './m4-assignment-protocol';
import {
  parseM4AssignmentObservation,
  profileResult,
  storedOpsResult,
  type AssignmentResult,
  type M4Response,
} from './m4-assignment-wire';
export type M4RelayProfile = 'ops' | 'legacy-admin' | 'legacy-agent' | 'staff';
export type M4RelayConfiguration = Readonly<{ origin: string; ca?: string; deadlineMs: number }>;
export const M4_RELAY_BODY_LIMIT = 32768;
export const M4_RELAY_RESPONSE_LIMIT = 16384;
export function m4RelayPath(profile: M4RelayProfile): string {
  if (profile === 'ops') return '/m4/assignment/ops';
  if (profile === 'legacy-admin') return '/m4/assignment/legacy-admin';
  if (profile === 'legacy-agent') return '/m4/assignment/legacy-agent';
  if (profile === 'staff') return '/m4/assignment/staff';
  throw new Error('Invalid fixed assignment profile');
}
export function m4RelayProfile(path: string): M4RelayProfile | undefined {
  if (path === '/m4/assignment/ops') return 'ops';
  if (path === '/m4/assignment/legacy-admin') return 'legacy-admin';
  if (path === '/m4/assignment/legacy-agent') return 'legacy-agent';
  if (path === '/m4/assignment/staff') return 'staff';
}
export function m4RelayDigest(value: unknown): string {
  const bytes = JSON.stringify(value);
  if (bytes === undefined) throw new Error('Bounded assignment data required');
  return createHash('sha256').update(bytes).digest('hex');
}
export function captureM4RelayConfiguration(value: M4RelayConfiguration): M4RelayConfiguration {
  try {
    const url = new URL(value.origin);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !url.hostname ||
      !Number.isSafeInteger(value.deadlineMs) ||
      value.deadlineMs < 1 ||
      value.deadlineMs > 2147483647 ||
      (value.ca !== undefined &&
        (typeof value.ca !== 'string' ||
          !value.ca.includes('-----BEGIN CERTIFICATE-----') ||
          value.ca.length > 65536))
    )
      throw new Error();
    return Object.freeze({
      origin: url.origin,
      deadlineMs: value.deadlineMs,
      ...(value.ca === undefined ? {} : { ca: value.ca }),
    });
  } catch {
    throw new Error('Invalid fixed assignment relay configuration');
  }
}
export function parseM4RelayEnvelope(body: string, profile: M4RelayProfile) {
  if (Buffer.byteLength(body) > M4_RELAY_BODY_LIMIT) return null;
  try {
    const row = JSON.parse(body) as Record<string, unknown>;
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).sort().join('|') !== 'observation|observationAuthority|request|version' ||
      row.version !== 1 ||
      row.observationAuthority !== 'untrusted-request-metadata'
    )
      return null;
    const request = parseM4AssignmentRequest(row.request),
      observation = parseM4AssignmentObservation(row.observation);
    if (
      !request ||
      !observation ||
      request.command !==
        (profile === 'ops'
          ? 'm4.ops.assign-owner'
          : profile === 'staff'
            ? 'm4.staff.assign-claim'
            : 'm4.legacy.assign-claim')
    )
      return null;
    return Object.freeze({
      request,
      serialized: row.request as string,
      observation: row.observation as string,
    });
  } catch {
    return null;
  }
}
const DENIALS = new Set([
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'RESOURCE_DENIED',
  'OPERATION_CONFLICT',
  'SELF_ASSIGNMENT_ONLY',
]);
export function parseM4RelayResponse(
  serialized: string,
  request: M4AssignmentRequest,
  profile: M4RelayProfile
): M4Response<AssignmentResult> | null {
  if (Buffer.byteLength(serialized) > M4_RELAY_RESPONSE_LIMIT) return null;
  try {
    const row = JSON.parse(serialized) as Record<string, unknown>;
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const keys = Object.keys(row).sort().join('|');
    if (row.status === 'denied')
      return keys === 'reason|status' &&
        typeof row.reason === 'string' &&
        DENIALS.has(row.reason) &&
        (profile !== 'ops' || row.reason !== 'SELF_ASSIGNMENT_ONLY')
        ? (row as M4Response<AssignmentResult>)
        : null;
    if (row.operationId !== request.operationId) return null;
    if (row.status === 'indeterminate')
      return keys === 'operationId|status'
        ? { status: 'indeterminate', operationId: request.operationId }
        : null;
    if (
      row.status !== 'completed' ||
      typeof row.replayed !== 'boolean' ||
      keys !==
        (profile === 'ops'
          ? 'operationId|replayed|result|status'
          : 'changed|operationId|replayed|result|status')
    )
      return null;
    const result =
      profile === 'ops'
        ? storedOpsResult(row.result, request.claimId, request.staffId as string)
        : profileResult(row.result, profile !== 'staff');
    if (profile !== 'ops' && (typeof row.changed !== 'boolean' || (!result.success && row.changed)))
      return null;
    return {
      status: 'completed',
      operationId: request.operationId,
      replayed: row.replayed,
      result,
      ...(profile === 'ops' ? {} : { changed: row.changed as boolean }),
    };
  } catch {
    return null;
  }
}
