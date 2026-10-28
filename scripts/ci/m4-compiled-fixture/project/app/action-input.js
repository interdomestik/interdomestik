import { parseM4AssignmentRequest } from '../vendor/apps/web/src/server/operations/m4-assignment-protocol.ts';
export const initialState = {
  outcome: 'idle',
  operationId: null,
  result: null,
};
export function actionInput(form, staff) {
  if (!(form instanceof FormData)) return null;
  const mode = form.get('targetMode');
  if (!['value', 'clear', 'omitted'].includes(mode) || (!staff && mode === 'omitted')) return null;
  const staffId = form.get('staffId');
  if (mode === 'value' && typeof staffId !== 'string') return null;
  const row = {
    version: 1,
    command: staff ? 'm4.staff.assign-claim' : 'm4.legacy.assign-claim',
    operationId: form.get('operationId'),
    claimId: form.get('claimId'),
    ...(mode === 'omitted' ? {} : { staffId: mode === 'clear' ? null : staffId }),
  };
  const parsed = parseM4AssignmentRequest(JSON.stringify(row));
  if (!parsed) return null;
  const { claimId, operationId } = parsed;
  return {
    claimId,
    operationId,
    ...(Object.hasOwn(parsed, 'staffId') ? { staffId: parsed.staffId } : {}),
  };
}
export function settled(input, result) {
  return {
    outcome: result.status === 'indeterminate' ? 'indeterminate' : 'settled',
    operationId: input.operationId,
    result,
  };
}
export function uncertain(input) {
  return {
    outcome: 'indeterminate',
    operationId: input.operationId,
    result: {
      success: false,
      status: 'indeterminate',
      operationId: input.operationId,
    },
  };
}
export const invalid = () => ({
  outcome: 'invalid',
  operationId: null,
  result: { success: false, error: 'Invalid fixture command' },
});
