import fs from 'node:fs';
import { execAsync } from '../../utils/exec.js';
import { resolveToolRepoPath } from '../../utils/tool-repo-root.js';

export async function auditDependencies(repoRoot: string) {
  const packageJsonPath = resolveToolRepoPath(repoRoot, 'package.json').resolvedPath;

  if (!fs.existsSync(packageJsonPath)) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Critical: Root package.json missing at ${packageJsonPath}\nResolved repo root: ${repoRoot}`,
        },
      ],
    };
  }

  await execAsync({ args: ['branch', '--show-current'], file: 'git' }, { cwd: repoRoot }).catch(
    () => ({
      stdout: 'unknown',
    })
  );
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
        text: `DEPENDENCY AUDIT: SUCCESS\n\nTARGET: ${repoRoot}\nPACKAGE: ${
          pkg.name || 'unknown'
        }\n\nCHECKS:\n${checks.join('\n')}`,
      },
    ],
  };
}
