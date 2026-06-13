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
