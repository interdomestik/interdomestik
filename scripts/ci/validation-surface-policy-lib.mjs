const NON_PRODUCT_ONLY_PATTERNS = [
  /^docs\//,
  /^\.agent\//,
  /^\.github\/(?:workflows|actions)\//,
  /^\.github\/pull_request_template\.md$/,
  /^docker\/Dockerfile\.ci-parity$/,
  /^docker-compose\.yml$/,
  /^scripts\/ci\//,
  /^scripts\/golden-loop\//,
  /^scripts\/multi-agent\//,
  /^scripts\/(?:ci-local-parity|docker-gate|docker-reclaim|docker-run|e2e-nightly-local|observe-local|start-system|start-system-quick)\.sh$/,
  /^scripts\/pr-finalizer\.sh$/,
  /^scripts\/pr-finalizer-lib\.sh$/,
  /^scripts\/plan[^/]*\.mjs$/,
  /^scripts\/repo-size-budget\.json$/,
  /^(?:README|CHANGELOG|CONTRIBUTING|LICENSE)(?:\.[^.]+)?$/,
];

const SAFE_PACKAGE_JSON_SCRIPT_PATTERNS = [
  /^boot:(?:dev|local)$/,
  /^ci:local(?::|$)/,
  /^docker:/,
  /^mcp:/,
  /^observe:local(?::|$)/,
  /^repo:size(?::|$)/,
  /^start:system(?::|$)/,
];

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map(file => String(file).trim()).filter(Boolean);
}

function stableValue(value) {
  return JSON.stringify(value ?? null);
}

function changedKeys(beforeObject = {}, afterObject = {}) {
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

export function evaluatePackageJsonValidationSurface({ beforeContent = '', afterContent = '' }) {
  try {
    const beforeJson = parsePackageJsonContent(beforeContent, 'before');
    const afterJson = parsePackageJsonContent(afterContent, 'after');
    const topLevelChangedKeys = changedKeys(beforeJson, afterJson);

    if (topLevelChangedKeys.some(key => key !== 'scripts')) {
      return { isNonProductOnly: false };
    }

    const changedScripts = changedKeys(beforeJson?.scripts, afterJson?.scripts);
    const allScriptsAreSafe = changedScripts.every(scriptName =>
      SAFE_PACKAGE_JSON_SCRIPT_PATTERNS.some(pattern => pattern.test(scriptName))
    );

    return { isNonProductOnly: changedScripts.length > 0 && allScriptsAreSafe };
  } catch {
    return { isNonProductOnly: false };
  }
}

function isNonProductOnlyPath(filePath, packageJsonSurface = null) {
  if (filePath === 'package.json') {
    return packageJsonSurface?.isNonProductOnly === true;
  }

  return NON_PRODUCT_ONLY_PATTERNS.some(pattern => pattern.test(filePath));
}

export function evaluateValidationSurface({
  eventName,
  changedFiles = [],
  packageJsonSurface = null,
}) {
  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);

  if (eventName !== 'pull_request' && eventName !== 'workflow_dispatch') {
    return {
      shouldRun: true,
      reason: `event:${eventName || 'unknown'}`,
      nonProductOnlyPaths: [],
    };
  }

  if (normalizedChangedFiles.length === 0) {
    return {
      shouldRun: true,
      reason: eventName === 'workflow_dispatch' ? 'manual_dispatch' : 'no_changed_files_detected',
      nonProductOnlyPaths: [],
    };
  }

  const nonProductOnlyPaths = normalizedChangedFiles.filter(filePath =>
    isNonProductOnlyPath(filePath, packageJsonSurface)
  );
  if (nonProductOnlyPaths.length === normalizedChangedFiles.length) {
    return {
      shouldRun: false,
      reason: 'non_product_only_pr',
      nonProductOnlyPaths,
    };
  }

  return {
    shouldRun: true,
    reason: 'runtime_sensitive_surface',
    nonProductOnlyPaths,
  };
}
