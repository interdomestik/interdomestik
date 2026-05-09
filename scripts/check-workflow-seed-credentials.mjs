import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_DIR = path.join(process.cwd(), '.github', 'workflows');
const EXPORT_SCRIPT = 'bash scripts/ci/export-e2e-credentials.sh';

const SEEDED_AUTH_COMMANDS = [
  'pnpm seed:e2e',
  'pnpm e2e:gate',
  'pnpm e2e:gate:pr',
  'pnpm --filter @interdomestik/web run e2e:gate',
];

function readWorkflowFiles() {
  return fs
    .readdirSync(WORKFLOW_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:ya?ml)$/u.test(entry.name))
    .map(entry => {
      const absolutePath = path.join(WORKFLOW_DIR, entry.name);
      return {
        name: entry.name,
        relativePath: path.relative(process.cwd(), absolutePath),
        content: fs.readFileSync(absolutePath, 'utf8'),
      };
    });
}

function workflowLines(content) {
  return content.split('\n').map(line => line.trim());
}

function hasReleaseGateLiteralPassword(content) {
  return workflowLines(content).some(line => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      return false;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    return (
      key.startsWith('RELEASE_GATE_') && key.endsWith('_PASSWORD') && value === 'GoldenPass123!'
    );
  });
}

function hasE2EApiPlaceholder(content) {
  return workflowLines(content).some(line => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      return false;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    return key === 'E2E_API_SECRET' && value === 'test-secret-placeholder';
  });
}

function hasSeededAuthCommand(content) {
  return SEEDED_AUTH_COMMANDS.some(command => content.includes(command));
}

export function runWorkflowSeedCredentialGuard() {
  const failures = [];

  for (const workflow of readWorkflowFiles()) {
    if (hasReleaseGateLiteralPassword(workflow.content)) {
      failures.push(
        `${workflow.relativePath}: release-gate password env must not use the shared seeded-user default`
      );
    }

    if (hasE2EApiPlaceholder(workflow.content)) {
      failures.push(`${workflow.relativePath}: E2E_API_SECRET must not use the placeholder value`);
    }

    if (hasSeededAuthCommand(workflow.content) && !workflow.content.includes(EXPORT_SCRIPT)) {
      failures.push(
        `${workflow.relativePath}: seeded E2E jobs must export masked per-run credentials before seeding/auth`
      );
    }
  }

  if (failures.length > 0) {
    console.error('Workflow seed credential guard failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    return 1;
  }

  console.log('Workflow seed credential guard passed: no shared workflow seed secrets found.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runWorkflowSeedCredentialGuard());
}
