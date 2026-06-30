function formatMissingEnvSummary(missingEnvCount: number) {
  return `[release-gate] Missing required env vars count=${missingEnvCount}; names redacted`;
}

module.exports = {
  formatMissingEnvSummary,
};
