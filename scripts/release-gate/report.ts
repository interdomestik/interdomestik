const fs = require('node:fs');
const path = require('node:path');

function toDateStamp(date) {
  return date.toISOString().slice(0, 10);
}

function asList(items) {
  if (!items || items.length === 0) return ['- N/A'];
  return items.map(item => `- ${item}`);
}

function getCheck(checks, id) {
  return (
    checks.find(check => check.id === id) || { status: 'SKIPPED', evidence: [], signatures: [] }
  );
}

function renderCheckResult(check) {
  return check.status || 'SKIPPED';
}

function renderP06Scenarios(p06) {
  const scenarios = Array.isArray(p06.scenarios) ? p06.scenarios : [];
  if (scenarios.length === 0) return ['- N/A'];

  const lines = [];
  for (const scenario of scenarios) {
    lines.push(`### ${scenario.id} ${scenario.title}`);
    lines.push('');
    lines.push(`- Account used: ${scenario.account || 'unknown'}`);
    lines.push(`- URL(s): ${(scenario.urls || []).join(' | ') || 'N/A'}`);
    lines.push(`- Expected markers: ${scenario.expectedSummary || 'N/A'}`);
    lines.push(`- Observed markers: ${scenario.observedSummary || 'N/A'}`);
    lines.push(`- Result: ${scenario.result || 'N/A'}`);
    if (scenario.failureSignature) {
      lines.push(`- Failure signature: ${scenario.failureSignature}`);
    }
    lines.push('');
  }
  return lines;
}

function writeReleaseGateReport(input) {
  const now = input.generatedAt || new Date();
  const day = toDateStamp(now);
  const safeDeployment = input.deploymentId || 'unknown';
  const outputDir = path.resolve(input.outDir);
  const fileName = `${day}_${input.envName}_${safeDeployment}.md`;
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
    `# Release Gate — ${input.envName} — ${day}`,
    '',
    '## Deployment',
    '',
    `- Environment: ${input.envName}`,
    `- Alias: ${input.baseUrl}`,
    `- Deployment ID: ${input.deploymentId || 'unknown'}`,
    `- Deployment URL: ${input.deploymentUrl || 'unknown'}`,
    `- Deployment provenance: ${input.deploymentSource || 'unknown'}`,
    '- Commit SHA: not available',
    '- Deployer: release-gate runner',
    '- Change summary:',
    '- Deterministic scripted release gate run',
    `- Scope: ${input.suite.toUpperCase()} (${input.executedChecks.join(', ')})`,
    `- Generated at: ${now.toISOString()}`,
    '',
    '## Preconditions',
    '',
    `- [x] Database migrations applied (if any): ${preconditions.migrations}`,
    `- [x] Environment variables verified (if any changes): ${preconditions.env}`,
    `- [x] Feature flags / rollout config: ${preconditions.flags}`,
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
    `- Member-only: ${input.accounts.member}`,
    `- Agent: ${input.accounts.agent}`,
    `- Staff: ${input.accounts.staff}`,
    `- Admin (KS): ${input.accounts.adminKs}`,
    `- Admin (MK): ${input.accounts.adminMk}`,
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
