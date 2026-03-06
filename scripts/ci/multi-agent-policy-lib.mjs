const HIGH_RISK_LABELS = new Set(['ci:multi-agent', 'release-hardening', 'security-hardening']);

const HIGH_RISK_PATTERNS = [
  /^scripts\/multi-agent\//,
  /^scripts\/release-gate\//,
  /^scripts\/(?:security-guard|pr-verify-hosts|m4-gatekeeper|docker-gate|sentry-seer-sweep|sonar-gate|sonar-scan(?:-lib)?)\.(?:mjs|sh)$/,
  /^apps\/web\/src\/proxy\.ts$/,
  /^packages\/database\/drizzle\//,
  /^packages\/database\/src\//,
  /^packages\/shared-auth\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^turbo\.json$/,
];

function normalizeLabels(labels) {
  return labels.map(label => String(label).trim()).filter(Boolean);
}

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map(file => String(file).trim()).filter(Boolean);
}

export function evaluateMultiAgentPolicy({ eventName, labels = [], changedFiles = [] }) {
  if (eventName === 'workflow_dispatch') {
    return {
      shouldRun: true,
      reason: 'manual_dispatch',
      matchedPaths: [],
    };
  }

  if (eventName !== 'pull_request') {
    return {
      shouldRun: false,
      reason: `unsupported_event:${eventName || 'unknown'}`,
      matchedPaths: [],
    };
  }

  const normalizedLabels = normalizeLabels(labels);
  for (const label of normalizedLabels) {
    if (HIGH_RISK_LABELS.has(label)) {
      return {
        shouldRun: true,
        reason: `label:${label}`,
        matchedPaths: [],
      };
    }
  }

  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);
  const matchedPaths = normalizedChangedFiles.filter(filePath =>
    HIGH_RISK_PATTERNS.some(pattern => pattern.test(filePath))
  );

  if (matchedPaths.length > 0) {
    return {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths,
    };
  }

  return {
    shouldRun: false,
    reason: 'default_skip_non_risky_pr',
    matchedPaths: [],
  };
}
