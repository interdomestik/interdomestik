// Golden Loop senior-review contract: a review only counts as valid evidence
// when it carries reviewer identity, the reviewed slice id, a scope/evidence
// reference, a findings section, and an explicit verdict. Only verdict READY
// with no unresolved BLOCKER findings is blocker-free.

const MIN_VALID_CHARS = 200;
const VERDICTS = ['READY AFTER FIXES', 'BLOCKED', 'READY']; // longest-prefix first
const REFUSAL_PHRASES = [
  "i can't help",
  "i can't assist",
  'i cannot help',
  'i cannot assist',
  'unable to help',
  'unable to review',
  'i must decline',
  'cannot comply',
];

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
  const fields = new Map();
  for (const line of output.split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    fields.set(line.slice(0, colon).trim().toUpperCase(), line.slice(colon + 1).trim());
  }
  const field = label => fields.get(label) || null;
  const verdictRaw = (field('VERDICT') || '').toUpperCase();
  return {
    reviewer: field('REVIEWER'),
    slice: field('SLICE'),
    scope: field('SCOPE'),
    hasFindings: fields.has('FINDINGS'),
    verdict: VERDICTS.find(verdict => verdictRaw.startsWith(verdict)) || null,
  };
}

function hasBlockerFinding(output) {
  for (const line of output.split('\n')) {
    let afterNumber = line.trimStart();
    let index = 0;
    while (index < afterNumber.length && afterNumber[index] >= '0' && afterNumber[index] <= '9') {
      index += 1;
    }
    if (index > 0 && ['.', ')'].includes(afterNumber[index])) {
      afterNumber = afterNumber.slice(index + 1).trimStart();
    }
    if (afterNumber.startsWith('BLOCKER:') || afterNumber.startsWith('BLOCKER-')) return true;
  }
  return false;
}

export function classifyReview(execResult, context = {}) {
  if (execResult.unavailable) return { status: 'unavailable', reason: execResult.reason };
  if (execResult.blocked) return { status: 'blocked', reason: execResult.reason };
  if (execResult.exitCode !== 0) {
    return {
      status: 'error',
      reason: `exit ${execResult.exitCode}: ${(execResult.output || '').slice(0, 200)}`,
    };
  }
  const output = execResult.output || '';
  const lowerOutput = output.toLowerCase();
  if (REFUSAL_PHRASES.some(phrase => lowerOutput.includes(phrase))) {
    return { status: 'refused', reason: 'route refused/rerouted' };
  }
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
  if (hasBlockerFinding(output)) {
    return {
      status: 'unresolved-blockers',
      reason: 'verdict READY but unresolved BLOCKER findings present',
    };
  }
  return {
    status: 'completed',
    reason: 'contract-valid READY review, no unresolved blockers',
    contract,
  };
}
