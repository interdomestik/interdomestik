import fs from 'fs';
import path from 'path';
import { WEB_APP } from '../../utils/paths.js';

export async function auditAccessibility() {
  const packageJsonPath = path.join(WEB_APP, 'package.json');
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
