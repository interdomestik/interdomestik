#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const eslintApiUrl = pathToFileURL(
  path.join(root, 'packages/shared-logging/node_modules/eslint/lib/api.js')
).href;

export async function lintDomains() {
  const { ESLint } = await import(eslintApiUrl);
  const domainSourceDirs = fs
    .readdirSync(path.join(root, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('domain-'))
    .map(entry => path.join('packages', entry.name, 'src'))
    .filter(sourceDir => fs.existsSync(path.join(root, sourceDir)));
  if (domainSourceDirs.length === 0) throw new Error('No domain source directories found');
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: path.join(root, 'packages/shared-logging/eslint.config.mjs'),
  });
  const results = await eslint.lintFiles(domainSourceDirs);
  const errors = ESLint.getErrorResults(results);
  const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
  const warningCount = results.reduce((total, result) => total + result.warningCount, 0);

  if (errors.length > 0) {
    const formatter = await eslint.loadFormatter('stylish');
    process.stderr.write(`${await formatter.format(errors)}\n`);
  }
  process.stdout.write(
    `[lint:domains] checked ${results.length} files: ${errorCount} errors, ${warningCount} advisory warnings\n`
  );

  return { errorCount, warningCount };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { errorCount } = await lintDomains();
  if (errorCount > 0) process.exitCode = 1;
}
