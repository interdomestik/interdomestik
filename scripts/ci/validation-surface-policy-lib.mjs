const NON_PRODUCT_ONLY_PATTERNS = [
  /^docs\//,
  /^\.agent\//,
  /^\.github\/(?:workflows|actions)\//,
  /^scripts\/ci\//,
  /^(?:README|CHANGELOG|CONTRIBUTING|LICENSE)(?:\.[^.]+)?$/,
];

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map(file => String(file).trim()).filter(Boolean);
}

function isNonProductOnlyPath(filePath) {
  return NON_PRODUCT_ONLY_PATTERNS.some(pattern => pattern.test(filePath));
}

export function evaluateValidationSurface({ eventName, changedFiles = [] }) {
  if (eventName === 'workflow_dispatch') {
    return {
      shouldRun: true,
      reason: 'manual_dispatch',
      nonProductOnlyPaths: [],
    };
  }

  if (eventName !== 'pull_request') {
    return {
      shouldRun: true,
      reason: `event:${eventName || 'unknown'}`,
      nonProductOnlyPaths: [],
    };
  }

  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);
  if (normalizedChangedFiles.length === 0) {
    return {
      shouldRun: true,
      reason: 'no_changed_files_detected',
      nonProductOnlyPaths: [],
    };
  }

  const nonProductOnlyPaths = normalizedChangedFiles.filter(isNonProductOnlyPath);
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
