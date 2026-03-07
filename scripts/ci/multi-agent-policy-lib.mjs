const HIGH_RISK_LABELS = new Set(['ci:multi-agent', 'release-hardening', 'security-hardening']);

const AUTO_RUN_HIGH_RISK_PATTERNS = [
  /^scripts\/multi-agent\//,
  /^scripts\/release-gate\//,
  /^scripts\/(?:security-guard|pr-verify-hosts|m4-gatekeeper|docker-gate|sentry-seer-sweep|sonar-gate|sonar-scan(?:-lib)?)\.(?:mjs|sh)$/,
  /^apps\/web\/src\/proxy\.ts$/,
  /^packages\/database\/src\/(?:db|migrate|server|tenant|tenant-security)\.ts$/,
  /^packages\/database\/src\/schema\/(?:auth|policies|rbac|tenants)\.ts$/,
  /^packages\/shared-auth\//,
  /^pnpm-lock\.yaml$/,
  /^turbo\.json$/,
];

const LABEL_GATED_HIGH_RISK_PATTERNS = [
  /^packages\/database\/drizzle\//,
  /^packages\/database\/src\//,
];

const HIGH_RISK_PACKAGE_JSON_SCRIPT_PATTERNS = [
  /^multiagent:/,
  /^release:/,
  /^security:guard$/,
  /^sonar:/,
  /^docker:/,
  /^sentry:/,
  /^pilot:check$/,
  /^pr:verify(?::|$)/,
];

const HIGH_RISK_PACKAGE_JSON_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'packageManager',
  'engines',
  'overrides',
  'resolutions',
];

const HIGH_RISK_PACKAGE_JSON_PNPM_KEYS = [
  'overrides',
  'patchedDependencies',
  'onlyBuiltDependencies',
  'neverBuiltDependencies',
];

function normalizeLabels(labels) {
  return labels.map(label => String(label).trim()).filter(Boolean);
}

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map(file => String(file).trim()).filter(Boolean);
}

function stableValue(value) {
  return JSON.stringify(value ?? null);
}

function collectChangedKeys(beforeObject = {}, afterObject = {}) {
  const keys = new Set([...Object.keys(beforeObject || {}), ...Object.keys(afterObject || {})]);
  return [...keys].filter(
    key => stableValue(beforeObject?.[key]) !== stableValue(afterObject?.[key])
  );
}

function parsePackageJsonContent(content, label) {
  if (!content) {
    throw new Error(`${label} package.json content is required`);
  }

  return JSON.parse(content);
}

export function evaluatePackageJsonRisk({ beforeContent = '', afterContent = '' }) {
  const matchedPaths = [];

  let beforeJson;
  let afterJson;

  try {
    beforeJson = parsePackageJsonContent(beforeContent, 'before');
    afterJson = parsePackageJsonContent(afterContent, 'after');
  } catch (error) {
    return {
      shouldRun: true,
      matchedPaths: [
        `package.json:analysis_failed:${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  for (const key of HIGH_RISK_PACKAGE_JSON_SECTIONS) {
    if (stableValue(beforeJson?.[key]) !== stableValue(afterJson?.[key])) {
      matchedPaths.push(`package.json:${key}`);
    }
  }

  const beforePnpm = beforeJson?.pnpm || {};
  const afterPnpm = afterJson?.pnpm || {};

  for (const key of HIGH_RISK_PACKAGE_JSON_PNPM_KEYS) {
    if (stableValue(beforePnpm?.[key]) !== stableValue(afterPnpm?.[key])) {
      matchedPaths.push(`package.json:pnpm.${key}`);
    }
  }

  const changedScripts = collectChangedKeys(beforeJson?.scripts, afterJson?.scripts);

  for (const scriptName of changedScripts) {
    if (HIGH_RISK_PACKAGE_JSON_SCRIPT_PATTERNS.some(pattern => pattern.test(scriptName))) {
      matchedPaths.push(`package.json:scripts.${scriptName}`);
    }
  }

  return {
    shouldRun: matchedPaths.length > 0,
    matchedPaths,
  };
}

export function evaluateMultiAgentPolicy({
  eventName,
  labels = [],
  changedFiles = [],
  packageJsonRisk = null,
}) {
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
  const matchedPaths = [];
  const labelGatedMatchedPaths = [];

  for (const filePath of normalizedChangedFiles) {
    if (filePath === 'package.json') {
      continue;
    }

    if (AUTO_RUN_HIGH_RISK_PATTERNS.some(pattern => pattern.test(filePath))) {
      matchedPaths.push(filePath);
      continue;
    }

    if (LABEL_GATED_HIGH_RISK_PATTERNS.some(pattern => pattern.test(filePath))) {
      labelGatedMatchedPaths.push(filePath);
    }
  }

  if (normalizedChangedFiles.includes('package.json')) {
    if (!packageJsonRisk) {
      matchedPaths.push('package.json:analysis_missing');
    } else if (packageJsonRisk.shouldRun) {
      matchedPaths.push(...packageJsonRisk.matchedPaths);
    }
  }

  if (matchedPaths.length > 0) {
    return {
      shouldRun: true,
      reason: 'high_risk_paths',
      matchedPaths: [...matchedPaths, ...labelGatedMatchedPaths],
    };
  }

  if (labelGatedMatchedPaths.length > 0) {
    return {
      shouldRun: false,
      reason: 'label_required_for_high_risk_paths',
      matchedPaths: labelGatedMatchedPaths,
    };
  }

  return {
    shouldRun: false,
    reason: 'default_skip_non_risky_pr',
    matchedPaths: [],
  };
}
