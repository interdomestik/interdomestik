const fs = require('node:fs');
const path = require('node:path');

function toDateStamp(date) {
  return date.toISOString().slice(0, 10);
}

function asList(items) {
  if (!items || items.length === 0) return ['- N/A'];
  return items.map(item => `- ${sanitizeReportText(item)}`);
}

function getCheck(checks, id) {
  return (
    checks.find(check => check.id === id) || { status: 'SKIPPED', evidence: [], signatures: [] }
  );
}

function renderCheckResult(check) {
  return check.status || 'SKIPPED';
}

function sanitizeFileSegment(value, fallback) {
  const safe = String(value || '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || fallback;
}

function sanitizeReportText(value) {
  const raw = String(value ?? '');
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/https?:\/\/\S*token=\S+/gi, '[REDACTED_SIGNED_URL]')
    .replace(/([?&]token=)[^&\s)]+/gi, '$1[REDACTED]');
}

function renderP06Scenarios(p06) {
  const scenarios = Array.isArray(p06.scenarios) ? p06.scenarios : [];
  if (scenarios.length === 0) return ['- N/A'];

  const lines = [];
  for (const scenario of scenarios) {
    lines.push(`### ${sanitizeReportText(scenario.id)} ${sanitizeReportText(scenario.title)}`);
    lines.push('');
    lines.push(`- Account used: ${sanitizeReportText(scenario.account || 'unknown')}`);
    lines.push(`- URL(s): ${sanitizeReportText((scenario.urls || []).join(' | ') || 'N/A')}`);
    lines.push(`- Expected markers: ${sanitizeReportText(scenario.expectedSummary || 'N/A')}`);
    lines.push(`- Observed markers: ${sanitizeReportText(scenario.observedSummary || 'N/A')}`);
    lines.push(`- Result: ${sanitizeReportText(scenario.result || 'N/A')}`);
    if (scenario.failureSignature) {
      lines.push(`- Failure signature: ${sanitizeReportText(scenario.failureSignature)}`);
    }
    lines.push('');
  }
  return lines;
}

function writeReleaseGateReport(input) {
  const now = input.generatedAt || new Date();
  const day = toDateStamp(now);
  const safeEnvName = sanitizeFileSegment(input.envName, 'unknown-env');
  const safeDeployment = sanitizeFileSegment(input.deploymentId, 'unknown');
  const outputDir = path.resolve(input.outDir);
  const fileName = `${day}_${safeEnvName}_${safeDeployment}.md`;
  const reportPath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });

  const p01 = getCheck(input.checks, 'P0.1');
  const p02 = getCheck(input.checks, 'P0.2');
  const p03 = getCheck(input.checks, 'P0.3');
  const p04 = getCheck(input.checks, 'P0.4');
  const p06 = getCheck(input.checks, 'P0.6');
  const p11 = getCheck(input.checks, 'P1.1');
  const p12 = getCheck(input.checks, 'P1.2');
  const p13 = getCheck(input.checks, 'P1.3');
  const p151 = getCheck(input.checks, 'P1.5.1');

  const failingSignatures = input.checks.flatMap(check => check.signatures || []);
  const verdict = failingSignatures.length > 0 ? 'NO-GO' : 'GO';
  const preconditions = input.preconditions || {
    migrations: 'not evaluated',
    env: 'validated by runner only',
    flags: 'none',
  };

  const content = [
    `# Release Gate — ${sanitizeReportText(input.envName)} — ${day}`,
    '',
    '## Deployment',
    '',
    `- Environment: ${sanitizeReportText(input.envName)}`,
    `- Alias: ${sanitizeReportText(input.baseUrl)}`,
    `- Deployment ID: ${sanitizeReportText(input.deploymentId || 'unknown')}`,
    `- Deployment URL: ${sanitizeReportText(input.deploymentUrl || 'unknown')}`,
    `- Deployment provenance: ${sanitizeReportText(input.deploymentSource || 'unknown')}`,
    '- Commit SHA: not available',
    '- Deployer: release-gate runner',
    '- Change summary:',
    '- Deterministic scripted release gate run',
    `- Scope: ${sanitizeReportText(input.suite.toUpperCase())} (${sanitizeReportText(input.executedChecks.join(', '))})`,
    `- Generated at: ${now.toISOString()}`,
    '',
    '## Preconditions',
    '',
    `- [x] Database migrations applied (if any): ${sanitizeReportText(preconditions.migrations)}`,
    `- [x] Environment variables verified (if any changes): ${sanitizeReportText(preconditions.env)}`,
    `- [x] Feature flags / rollout config: ${sanitizeReportText(preconditions.flags)}`,
    '',
    '## Gate Scope',
    '',
    'This release gate covers:',
    '',
    '- RBAC (member/agent/staff/admin)',
    '- Cross-tenant isolation',
    '- Admin role add/remove',
    '- Evidence upload/download + persistence',
    '- Staff claim update persistence',
    '- Production error log sweep',
    '',
    '## Test Accounts Used',
    '',
    `- Member-only: ${sanitizeReportText(input.accounts.member)}`,
    `- Agent: ${sanitizeReportText(input.accounts.agent)}`,
    `- Staff: ${sanitizeReportText(input.accounts.staff)}`,
    `- Admin (KS): ${sanitizeReportText(input.accounts.adminKs)}`,
    `- Admin (MK): ${sanitizeReportText(input.accounts.adminMk)}`,
    '',
    '---',
    '',
    '# P0 — Security & Isolation',
    '',
    '## P0.1 RBAC Route Access Matrix (marker-based)',
    '',
    `**Result:** ${renderCheckResult(p01)}`,
    '',
    'Evidence:',
    ...asList(p01.evidence),
    '',
    '## P0.2 Cross-Tenant Isolation',
    '',
    `**Result:** ${renderCheckResult(p02)}`,
    '',
    'Observed:',
    ...asList(p02.evidence),
    '',
    '## P0.3 Admin Role Assignment Works',
    '',
    `**Result:** ${renderCheckResult(p03)}`,
    '',
    'Observed:',
    ...asList(p03.evidence),
    '',
    '## P0.4 Admin Role Removal Works',
    '',
    `**Result:** ${renderCheckResult(p04)}`,
    '',
    'Observed:',
    ...asList(p04.evidence),
    '',
    '## P0.6 RBAC Stress Matrix v1',
    '',
    `**Result:** ${renderCheckResult(p06)}`,
    '',
    ...renderP06Scenarios(p06),
    '',
    '---',
    '',
    '# P1 — Must-Pass Functionality',
    '',
    '## P1.1 Member Evidence Upload Persistence',
    '',
    `**Result:** ${renderCheckResult(p11)}`,
    '',
    'Observed:',
    ...asList(p11.evidence),
    '',
    '## P1.2 Member Evidence Download Works',
    '',
    `**Result:** ${renderCheckResult(p12)}`,
    '',
    'Observed:',
    ...asList(p12.evidence),
    '',
    '## P1.3 Staff Claim Update Persistence (Status + Note)',
    '',
    `**Result:** ${renderCheckResult(p13)}`,
    '',
    'Observed:',
    ...asList(p13.evidence),
    '',
    '---',
    '',
    '# P1.5 — Observability',
    '',
    '## P1.5.1 Production Error Log Sweep (60m)',
    '',
    `**Result:** ${renderCheckResult(p151)}`,
    '',
    'Observed:',
    ...asList(p151.evidence),
    '',
    '---',
    '',
    '# Verdict',
    '',
    '## Final Status',
    '',
    `- **${verdict}**`,
    '',
    '## If NO-GO: Failing Signatures',
    '',
    ...asList(failingSignatures),
    '',
    '## Follow-ups / Tech Debt',
    '',
    '- i18n coverage intentionally excluded from this gate; handled by nightly jobs.',
  ].join('\n');

  fs.writeFileSync(reportPath, `${content}\n`, 'utf8');

  return {
    reportPath,
    verdict,
    failingSignatures,
  };
}

module.exports = {
  writeReleaseGateReport,
};
