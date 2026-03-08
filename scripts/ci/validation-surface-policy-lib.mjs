const NON_PRODUCT_ONLY_PATTERNS = [
  /^docs\//,
  /^\.agent\//,
  /^\.github\/(?:workflows|actions)\//,
  /^scripts\/plan[^/]*\.mjs$/,
  /^(?:README|CHANGELOG|CONTRIBUTING|LICENSE)(?:\.[^.]+)?$/,
];

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map(file => String(file).trim()).filter(Boolean);
}

function isNonProductOnlyPath(filePath) {
  return NON_PRODUCT_ONLY_PATTERNS.some(pattern => pattern.test(filePath));
}

export function evaluateValidationSurface({ eventName, changedFiles = [] }) {
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
