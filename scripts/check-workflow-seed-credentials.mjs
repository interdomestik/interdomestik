import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_DIR = path.join(process.cwd(), '.github', 'workflows');
const EXPORT_SCRIPT = 'bash scripts/ci/export-e2e-credentials.sh';

const RELEASE_GATE_LITERAL_PASSWORD = /^\s*RELEASE_GATE_[A-Z_]*_PASSWORD:\s*GoldenPass123!\s*$/gm;
const E2E_API_PLACEHOLDER = /^\s*E2E_API_SECRET:\s*test-secret-placeholder\s*$/gm;
const SEEDED_AUTH_COMMAND =
  /\bpnpm\s+(?:seed:e2e|e2e:gate(?::pr)?|--filter\s+@interdomestik\/web\s+run\s+e2e:gate)\b/;

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

export function runWorkflowSeedCredentialGuard() {
  const failures = [];

  for (const workflow of readWorkflowFiles()) {
    if (RELEASE_GATE_LITERAL_PASSWORD.test(workflow.content)) {
      failures.push(
        `${workflow.relativePath}: release-gate password env must not use the shared seeded-user default`
      );
    }
    RELEASE_GATE_LITERAL_PASSWORD.lastIndex = 0;

    if (E2E_API_PLACEHOLDER.test(workflow.content)) {
      failures.push(`${workflow.relativePath}: E2E_API_SECRET must not use the placeholder value`);
    }
    E2E_API_PLACEHOLDER.lastIndex = 0;

    if (SEEDED_AUTH_COMMAND.test(workflow.content) && !workflow.content.includes(EXPORT_SCRIPT)) {
      failures.push(
        `${workflow.relativePath}: seeded E2E jobs must export masked per-run credentials before seeding/auth`
      );
    }
    SEEDED_AUTH_COMMAND.lastIndex = 0;
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
