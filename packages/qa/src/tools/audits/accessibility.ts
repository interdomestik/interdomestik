import fs from 'node:fs';
import path from 'node:path';
import { resolveToolRepoPath } from '../../utils/tool-repo-root.js';

export async function auditAccessibility(repoRoot: string) {
  const webApp = resolveToolRepoPath(repoRoot, 'apps/web').resolvedPath;
  const packageJsonPath = path.join(webApp, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return { content: [{ type: 'text', text: '❌ Critical: Web package.json missing' }] };
  }
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

  const checks: string[] = [];
  const issues: string[] = [];

  if (allDeps['@axe-core/react'] || allDeps['jest-axe'] || allDeps['axe-core']) {
    checks.push('✅ Axe accessibility tools installed');
  } else {
    issues.push('❌ Missing accessibility tools (@axe-core/react or similar)');
  }

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `ACCESSIBILITY AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}
