const SUPPORTED_PULL_REQUEST_ACTIONS = new Set([
  'converted_to_draft',
  'labeled',
  'opened',
  'ready_for_review',
  'reopened',
  'synchronize',
]);

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`);
  }
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function bindRunAttempt(result, runAttempt) {
  if (runAttempt === 1) return result;
  if (result.runBroad) return { ...result, consumeFullGate: false };
  return {
    runBroad: false,
    certificationRequired: true,
    consumeFullGate: false,
    reason: 'workflow-rerun-certification-required',
  };
}

function isCertificationEvent({ action, draft, labelName }) {
  return (
    action === 'ready_for_review' ||
    ((action === 'opened' || action === 'reopened') && draft === false) ||
    (action === 'labeled' && labelName === 'full-gate')
  );
}

export function evaluateExactHeadCertification(input) {
  const policyShouldRun = requireBoolean(input.policyShouldRun, 'policyShouldRun');
  const policyRunFull = requireBoolean(input.policyRunFull, 'policyRunFull');
  const policyForceFull = requireBoolean(input.policyForceFull, 'policyForceFull');
  const runAttempt = requirePositiveInteger(input.runAttempt, 'runAttempt');

  if (input.eventName !== 'pull_request') {
    return bindRunAttempt(
      {
        runBroad: policyShouldRun,
        certificationRequired: false,
        consumeFullGate: false,
        reason: input.policyReason,
      },
      runAttempt
    );
  }

  if (input.sameRepository !== true) {
    return bindRunAttempt(
      {
        runBroad: false,
        certificationRequired: true,
        consumeFullGate: false,
        reason: 'same-repository-certification-required',
      },
      runAttempt
    );
  }

  requireBoolean(input.draft, 'draft');
  if (!SUPPORTED_PULL_REQUEST_ACTIONS.has(input.action)) {
    return bindRunAttempt(
      {
        runBroad: false,
        certificationRequired: true,
        consumeFullGate: false,
        reason: 'unsupported-pull-request-action',
      },
      runAttempt
    );
  }

  const fullGateEvent = input.action === 'labeled' && input.labelName === 'full-gate';
  const certificationEvent = isCertificationEvent(input);

  if (input.action === 'labeled' && !fullGateEvent && !policyForceFull) {
    const certificationRequired = policyShouldRun && policyRunFull && input.draft === false;
    return bindRunAttempt(
      {
        runBroad: false,
        certificationRequired,
        consumeFullGate: false,
        reason: certificationRequired ? 'exact-head-certification-required' : 'unrelated-label',
      },
      runAttempt
    );
  }

  if (policyShouldRun && (policyForceFull || certificationEvent)) {
    return bindRunAttempt(
      {
        runBroad: true,
        certificationRequired: false,
        consumeFullGate: fullGateEvent,
        reason: certificationEvent ? 'exact-head-certification' : input.policyReason,
      },
      runAttempt
    );
  }

  const certificationRequired =
    policyShouldRun && policyRunFull && input.draft === false && input.action === 'synchronize';

  return bindRunAttempt(
    {
      runBroad: false,
      certificationRequired,
      consumeFullGate: false,
      reason: certificationRequired ? 'exact-head-certification-required' : input.policyReason,
    },
    runAttempt
  );
}
