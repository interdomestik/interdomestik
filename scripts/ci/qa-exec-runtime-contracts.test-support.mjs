import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const repoRoot = process.cwd();
export function runModuleExpression(modulePath, expression) {
  const moduleUrl = pathToFileURL(path.join(repoRoot, modulePath)).href;
  const script = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    const result = await (${expression});
    console.log(JSON.stringify(result));
  `;

  const stdout = execFileSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  return JSON.parse(stdout);
}
