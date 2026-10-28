import type { M4AssignmentObservation } from './m4-assignment-kernel-shared';

export type OpsResult =
  | { success: true; data: { id: string; staffId: string; assignedAt: string } }
  | { success: false; error: string };
export type LegacyResult =
  { success: true; error: undefined } | { success: false; error: string; data: undefined };
export type StaffResult = { success: boolean; error?: string; data?: undefined };
export type AssignmentResult = OpsResult | LegacyResult | StaffResult;
export type M4DenialReason =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'RESOURCE_DENIED'
  | 'OPERATION_CONFLICT'
  | 'SELF_ASSIGNMENT_ONLY';
export type M4Response<R> =
  | { status: 'completed'; operationId: string; replayed: boolean; result: R; changed?: boolean }
  | { status: 'denied'; reason: M4DenialReason }
  | { status: 'indeterminate'; operationId: string };

export function parseM4AssignmentObservation(serialized: unknown): M4AssignmentObservation | null {
  if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > 8192)
    return null;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const row = value as Record<string, unknown>;
    if (
      Object.keys(row).length !== 2 ||
      Object.keys(row).some(key => key !== 'ip' && key !== 'userAgent')
    )
      return null;
    if (row.ip !== null && (typeof row.ip !== 'string' || row.ip.length > 256)) return null;
    if (
      row.userAgent !== null &&
      (typeof row.userAgent !== 'string' || row.userAgent.length > 1024)
    )
      return null;
    return Object.freeze({
      ip: row.ip as string | null,
      userAgent: row.userAgent as string | null,
    });
  } catch {
    return null;
  }
}

export function opsSuccess(
  value: unknown,
  claimId: string,
  staffId: string
): Extract<OpsResult, { success: true }> {
  if (!value || typeof value !== 'object') throw new Error('Invalid operation result');
  const row = value as Record<string, unknown>;
  if (row.success !== true || !row.data || typeof row.data !== 'object')
    throw new Error('Invalid operation result');
  const data = row.data as Record<string, unknown>;
  const assignedAt =
    data.assignedAt instanceof Date ? data.assignedAt.toISOString() : data.assignedAt;
  if (
    data.id !== claimId ||
    data.staffId !== staffId ||
    typeof assignedAt !== 'string' ||
    !Number.isFinite(Date.parse(assignedAt))
  )
    throw new Error('Invalid operation result');
  return { success: true, data: { id: data.id, staffId: data.staffId, assignedAt } };
}
export function storedOpsResult(value: unknown, claimId: string, staffId: string): OpsResult {
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if (
      row.success === false &&
      typeof row.error === 'string' &&
      row.error.length > 0 &&
      row.error.length <= 512
    )
      return { success: false, error: row.error };
  }
  return opsSuccess(value, claimId, staffId);
}
export function profileResult(value: unknown, legacy: boolean): LegacyResult | StaffResult {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid operation result');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some(key => key !== 'success' && key !== 'error' && key !== 'data') ||
    row.data !== undefined
  )
    throw new Error('Invalid operation result');
  if (row.success === true && row.error === undefined)
    return legacy ? { success: true, error: undefined } : { success: true };
  if (
    row.success !== false ||
    typeof row.error !== 'string' ||
    row.error.length === 0 ||
    row.error.length > 512
  )
    throw new Error('Invalid operation result');
  return legacy
    ? { success: false, error: row.error, data: undefined }
    : { success: false, error: row.error };
}
export function storedProfileOutcome(value: unknown, legacy: boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid operation outcome');
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== 2 ||
    Object.keys(row).some(key => key !== 'result' && key !== 'changed') ||
    typeof row.changed !== 'boolean'
  )
    throw new Error('Invalid operation outcome');
  const result = profileResult(row.result, legacy);
  if (!result.success && row.changed) throw new Error('Invalid operation outcome');
  return { result, changed: row.changed };
}
