// Golden Loop senior-review contract: a review only counts as valid evidence
// when it carries reviewer identity, the reviewed slice id, a scope/evidence
// reference, a findings section, and an explicit verdict. Only verdict READY
// with no unresolved BLOCKER findings is blocker-free.

const REFUSAL_PATTERN = /\b(i can(?:no|')t (?:help|assist)|unable to (?:help|review)|i must decline|cannot comply)\b/i;
const BLOCKER_PATTERN = /^\s*(?:\d+[.)]\s*)?BLOCKER\s*[:\-]/im;
const MIN_VALID_CHARS = 200;
const VERDICTS = ['READY AFTER FIXES', 'BLOCKED', 'READY']; // longest-prefix first

export function buildContractPreamble(sliceId) {
  return [
    'Senior review required. Reply using exactly this contract:',
    'REVIEWER: <your model/identity>',
    `SLICE: ${sliceId}`,
    'SCOPE: <files reviewed or evidence-packet reference>',
    'FINDINGS:',
    '<numbered findings; prefix each unresolved must-fix item with "BLOCKER:">',
    'VERDICT: READY | READY AFTER FIXES | BLOCKED',
    '',
  ].join('\n');
}

export function parseReviewContract(output) {
  const field = label =>
    output.match(new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im'))?.[1]?.trim() || null;
  const verdictRaw = (field('VERDICT') || '').toUpperCase();
  return {
    reviewer: field('REVIEWER'),
    slice: field('SLICE'),
    scope: field('SCOPE'),
    hasFindings: /^\s*FINDINGS\s*:/im.test(output),
    verdict: VERDICTS.find(verdict => verdictRaw.startsWith(verdict)) || null,
  };
}

export function classifyReview(execResult, context = {}) {
  if (execResult.unavailable) return { status: 'unavailable', reason: execResult.reason };
  if (execResult.exitCode !== 0) {
    return {
      status: 'error',
      reason: `exit ${execResult.exitCode}: ${(execResult.output || '').slice(0, 200)}`,
    };
  }
  const output = execResult.output || '';
  if (REFUSAL_PATTERN.test(output)) return { status: 'refused', reason: 'route refused/rerouted' };
  if (output.trim().length < MIN_VALID_CHARS) {
    return { status: 'invalid', reason: `review too short (${output.trim().length} chars)` };
  }
  const contract = parseReviewContract(output);
  const missing = ['reviewer', 'slice', 'scope'].filter(key => !contract[key]);
  if (!contract.hasFindings) missing.push('findings');
  if (!contract.verdict) missing.push('verdict');
  if (missing.length > 0) {
    return { status: 'invalid', reason: `missing review contract field(s): ${missing.join(', ')}` };
  }
  if (context.sliceId && contract.slice !== context.sliceId) {
    return {
      status: 'invalid',
      reason: `slice mismatch: reviewed ${contract.slice}, expected ${context.sliceId}`,
    };
  }
  if (contract.verdict !== 'READY') {
    return { status: 'unresolved-blockers', reason: `verdict ${contract.verdict}` };
  }
  if (BLOCKER_PATTERN.test(output)) {
    return {
      status: 'unresolved-blockers',
      reason: 'verdict READY but unresolved BLOCKER findings present',
    };
  }
  return { status: 'completed', reason: 'contract-valid READY review, no unresolved blockers', contract };
}
