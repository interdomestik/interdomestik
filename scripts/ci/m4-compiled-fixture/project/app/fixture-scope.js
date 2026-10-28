// Server-only finite qualification plan; no caller-supplied identity or authority.
import { actionInput } from './action-input.js';
import { readPlan, validatePlan } from './fixture-plan.js';

export function matchQualificationInput(form, profile, plan) {
  if (!['legacy-admin', 'legacy-agent', 'staff'].includes(profile) || !(form instanceof FormData))
    return null;
  try {
    validatePlan(plan);
  } catch {
    return null;
  }
  const scenario = plan.scenarios.find(row => row.profile === profile);
  if (!scenario) return null;
  for (const name of ['claimId', 'operationId', 'targetMode'])
    if (form.getAll(name).length !== 1) return null;
  const staffValues = form.getAll('staffId');
  if (scenario.targetMode === 'value' ? staffValues.length !== 1 : staffValues.length !== 0)
    return null;
  const input = actionInput(form, profile === 'staff');
  if (
    !input ||
    input.claimId !== scenario.claimId ||
    form.get('targetMode') !== scenario.targetMode
  )
    return null;
  if (scenario.targetMode === 'omitted') {
    if (Object.hasOwn(input, 'staffId')) return null;
  } else if (!Object.hasOwn(input, 'staffId') || input.staffId !== scenario.staffId) {
    return null;
  }
  return input;
}

export function qualificationInput(form, profile) {
  try {
    return matchQualificationInput(form, profile, readPlan());
  } catch {
    return null;
  }
}
