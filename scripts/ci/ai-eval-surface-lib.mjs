const AI_EVAL_PATTERNS = [
  /^apps\/web\/src\/app\/api\/ai\//,
  /^apps\/web\/src\/app\/api\/policies\/analyze\//,
  /^apps\/web\/src\/lib\/ai\//,
  /^apps\/web\/src\/lib\/inngest\//,
  /^apps\/web\/package\.json$/,
  /^packages\/database\/src\/schema\/ai\.ts$/,
  /^packages\/domain-ai\//,
  /^packages\/domain-ai\/package\.json$/,
  /^packages\/domain-claims\/src\/claims\//,
  /^packages\/domain-claims\/package\.json$/,
  /^scripts\/ai\/eval\//,
];

function normalizeChangedFiles(changedFiles) {
  return changedFiles.map(file => String(file).trim()).filter(Boolean);
}

function isAiEvalPath(filePath) {
  return AI_EVAL_PATTERNS.some(pattern => pattern.test(filePath));
}

export function evaluateAiEvalSurface({ eventName, changedFiles = [] }) {
  const normalizedChangedFiles = normalizeChangedFiles(changedFiles);

  if (eventName !== 'pull_request') {
    return {
      shouldRun: true,
      reason: `event:${eventName || 'unknown'}`,
      matchedPaths: [],
    };
  }

  if (normalizedChangedFiles.length === 0) {
    return {
      shouldRun: true,
      reason: 'no_changed_files_detected',
      matchedPaths: [],
    };
  }

  const matchedPaths = normalizedChangedFiles.filter(isAiEvalPath);
  if (matchedPaths.length === 0) {
    return {
      shouldRun: false,
      reason: 'no_ai_eval_surface_changes',
      matchedPaths: [],
    };
  }

  return {
    shouldRun: true,
    reason: 'ai_eval_surface_changed',
    matchedPaths,
  };
}
