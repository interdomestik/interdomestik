import { actionFailure, type ActionFailure } from './safe-action.failure';

// Next adds its own `$ACTION_*` fields to a submitted form; they are transport, never input.
const NEXT_ACTION_FIELD = /^\$ACTION_/;

/**
 * The field map of a submitted form (design §1.5): built on a null prototype, Next's own fields
 * dropped, every value of a key whose schema is an array collected, any other repeated key refused.
 */
export function formDataToInput(
  formData: unknown,
  arrayKeys: ReadonlySet<string>
): Record<string, unknown> | ActionFailure {
  if (!(formData instanceof FormData)) {
    return actionFailure('VALIDATION_ERROR', undefined, { issues: { _root: 'invalid_type' } });
  }
  const input: Record<string, unknown> = Object.create(null);
  for (const key of new Set(formData.keys())) {
    if (NEXT_ACTION_FIELD.test(key)) continue;
    const values = formData.getAll(key);
    if (arrayKeys.has(key)) {
      input[key] = values;
    } else if (values.length === 1) {
      input[key] = values[0];
    } else {
      return actionFailure('VALIDATION_ERROR', undefined, { issues: { [key]: 'duplicate_field' } });
    }
  }
  return input;
}
