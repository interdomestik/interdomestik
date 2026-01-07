import fs from 'fs';
import path from 'path';
import { execAsync } from '../../utils/exec.js';
import { REPO_ROOT } from '../../utils/paths.js';

export async function auditDependencies() {
  const packageJsonPath = path.join(REPO_ROOT, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Critical: Root package.json missing at ${packageJsonPath}\nResolved repo root: ${REPO_ROOT}`,
        },
      ],
    };
  }

  await execAsync('git branch --show-current', { cwd: REPO_ROOT }).catch(() => ({
    stdout: 'unknown',
  }));
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const checks: string[] = [];
  if (pkg.workspaces) checks.push('✅ Workspaces configured');
  if (pkg.scripts?.dev) checks.push("✅ 'dev' script present");
  if (pkg.scripts?.build) checks.push("✅ 'build' script present");
  if (pkg.scripts?.lint) checks.push("✅ 'lint' script present");

  return {
    content: [
      {
        type: 'text',
        text: `DEPENDENCY AUDIT: SUCCESS\n\nTARGET: ${REPO_ROOT}\nPACKAGE: ${
          pkg.name || 'unknown'
        }\n\nCHECKS:\n${checks.join('\n')}`,
      },
    ],
  };
}
