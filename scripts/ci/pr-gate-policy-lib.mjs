const HIGH_RISK_EXACT_PATHS = new Set([
  'apps/web/src/proxy.ts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'scripts/pr-finalizer.sh',
  'scripts/pr-finalizer-lib.sh',
]);

const HIGH_RISK_PREFIXES = [
  'packages/domain-privacy/',
  'packages/domain-ai/',
  'apps/web/src/lib/ai/',
  'apps/web/src/app/api/ai/',
  'apps/web/src/app/api/privacy/',
  'apps/web/src/components/privacy/',
  'apps/web/src/features/claims/components/ai-extraction-consent-',
  'apps/web/src/lib/auth/',
  'apps/web/src/lib/proxy-',
  'apps/web/src/server/auth/',
  'apps/web/src/lib/tenant/',
  'packages/shared-auth/',
  'packages/database/',
  'packages/domain-membership-billing/',
  'supabase/',
  '.github/workflows/',
  '.github/actions/',
  'scripts/ci/',
  'scripts/release-gate/',
  'scripts/release-',
  'scripts/security/',
  'scripts/security-',
  'scripts/sonar-',
  'scripts/paddle-',
];

const APP_SECURITY_OR_BILLING_PATH =
  /(?:^|\/)(?:auth|tenant|paddle|billing|subscription)(?:[./-]|\/|$)/u;

export function isHighRiskPath(changedPath) {
  return (
    HIGH_RISK_EXACT_PATHS.has(changedPath) ||
    HIGH_RISK_PREFIXES.some(prefix => changedPath.startsWith(prefix)) ||
    changedPath.endsWith('/package.json') ||
    (changedPath.startsWith('apps/web/src/') && APP_SECURITY_OR_BILLING_PATH.test(changedPath))
  );
}

export function evaluatePrGatePolicy(input) {
  const {
    eventName,
    draft,
    labels = [],
    changedFiles = [],
    changedFilesComplete = false,
  } = input;

  if (eventName !== 'pull_request') {
    return fullDecision(false, `non-pull-request:${eventName || 'unknown'}`);
  }

  if (typeof draft !== 'boolean') {
    return fullDecision(true, 'pull-request-state-missing');
  }

  if (labels.includes('full-gate')) {
    return fullDecision(true, 'full-gate-label');
  }

  if (!changedFilesComplete) {
    return fullDecision(true, 'changed-files-incomplete');
  }

  const highRiskPaths = changedFiles.filter(isHighRiskPath);
  if (highRiskPaths.length > 0) {
    return fullDecision(true, 'high-risk-change', highRiskPaths);
  }

  if (!draft) {
    return fullDecision(false, 'pull-request-ready');
  }

  return {
    runFull: false,
    forceFull: false,
    reason: 'ordinary-draft',
    highRiskPaths: [],
  };
}

function fullDecision(forceFull, reason, highRiskPaths = []) {
  return { runFull: true, forceFull, reason, highRiskPaths };
}
