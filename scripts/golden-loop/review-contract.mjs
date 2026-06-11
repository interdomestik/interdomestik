// Golden Loop senior-review contract: a review only counts as valid evidence
// when it carries reviewer identity, the reviewed slice id, a scope/evidence
// reference, a findings section, and an explicit verdict. Only verdict READY
// with no unresolved BLOCKER findings is blocker-free.

const MIN_VALID_CHARS = 200;
const VERDICTS = ['READY AFTER FIXES', 'BLOCKED', 'READY']; // longest-prefix first
const REFUSAL_PHRASES = [
  'i cannot help',
  "i can't help",
  'i cannot assist',
  "i can't assist",
  'unable to help',
  'unable to review',
  'i must decline',
  'cannot comply',
];

function linesOf(output) {
  return output.split('\n').map(line => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

function fieldValue(output, label) {
  const prefix = `${label}:`;
  for (const line of linesOf(output)) {
    const trimmed = line.trimStart();
    if (trimmed.toUpperCase().startsWith(prefix)) return trimmed.slice(prefix.length).trim();
  }
  return null;
}

function hasSection(output, label) {
  return linesOf(output).some(line => line.trim().toUpperCase() === `${label}:`);
}

function withoutListPrefix(line) {
  const trimmed = line.trimStart();
  let index = 0;
  while (index < trimmed.length && trimmed[index] >= '0' && trimmed[index] <= '9') index += 1;
  if (index === 0) return trimmed;
  const marker = trimmed[index];
  if ((marker === '.' || marker === ')') && trimmed[index + 1] === ' ') {
    return trimmed.slice(index + 2).trimStart();
  }
  return trimmed;
}

function hasBlockerFinding(output) {
  return linesOf(output).some(line => {
    const upper = withoutListPrefix(line).toUpperCase();
    return upper.startsWith('BLOCKER:') || upper.startsWith('BLOCKER -');
  });
}

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
  const verdictRaw = (fieldValue(output, 'VERDICT') || '').toUpperCase();
  return {
    reviewer: fieldValue(output, 'REVIEWER'),
    slice: fieldValue(output, 'SLICE'),
    scope: fieldValue(output, 'SCOPE'),
    hasFindings: hasSection(output, 'FINDINGS'),
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
