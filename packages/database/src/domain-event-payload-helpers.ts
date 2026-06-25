export function assertNoUnexpectedPayloadFields(
  payload: Record<string, unknown>,
  eventName: string,
  allowedKeys: Set<string>
): void {
  for (const field of Object.keys(payload)) {
    if (!allowedKeys.has(field)) {
      throw new Error(`appendEvent payload field ${field} is not allowlisted for ${eventName}`);
    }
  }
}

export function assertRequiredPayloadField(
  payload: Record<string, unknown>,
  field: string
): unknown {
  if (!Object.hasOwn(payload, field)) {
    throw new Error(`appendEvent requires payload.${field}`);
  }
  return payload[field];
}

export function assertBooleanPayloadField(
  payload: Record<string, unknown>,
  field: string
): boolean {
  const value = assertRequiredPayloadField(payload, field);
  if (typeof value !== 'boolean') {
    throw new TypeError(`appendEvent requires payload.${field} to be a boolean`);
  }
  return value;
}

export function assertStringSetPayloadField(
  payload: Record<string, unknown>,
  field: string,
  allowedValues: Set<string>,
  description: string
): string {
  const value = assertRequiredPayloadField(payload, field);
  if (typeof value !== 'string' || !allowedValues.has(value)) {
    throw new Error(`appendEvent requires payload.${field} to be ${description}`);
  }
  return value;
}

export function assertIntegerPayloadField(
  payload: Record<string, unknown>,
  field: string,
  minimum: number
): number {
  const value = assertRequiredPayloadField(payload, field);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`appendEvent requires payload.${field} to be an integer >= ${minimum}`);
  }
  return value;
}

export function evidenceReferencePayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const evidenceCount = payload.evidenceCount;
  const evidenceIds = payload.evidenceIds;
  if (evidenceCount === undefined && evidenceIds === undefined) return {};
  if (!Number.isInteger(evidenceCount) || Number(evidenceCount) < 0) {
    throw new Error('appendEvent requires payload.evidenceCount to be a non-negative integer');
  }
  if (!Array.isArray(evidenceIds)) {
    throw new TypeError('appendEvent requires payload.evidenceIds to be an array');
  }
  if (evidenceIds.some(evidenceId => typeof evidenceId !== 'string' || evidenceId.trim() === '')) {
    throw new Error('appendEvent requires payload.evidenceIds to be non-empty string ids');
  }
  if (evidenceCount !== evidenceIds.length) {
    throw new Error('appendEvent requires payload.evidenceCount to match payload.evidenceIds');
  }
  return { evidenceCount, evidenceIds: [...evidenceIds] };
}
