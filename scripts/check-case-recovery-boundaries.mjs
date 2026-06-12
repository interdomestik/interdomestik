#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const boundaries = [
  {
    name: 'domain-case',
    packageName: '@interdomestik/domain-case',
    root: 'packages/domain-case',
    forbiddenPackage: '@interdomestik/domain-recovery',
    forbiddenPathPart: 'domain-recovery',
  },
  {
    name: 'domain-recovery',
    packageName: '@interdomestik/domain-recovery',
    root: 'packages/domain-recovery',
    forbiddenPackage: '@interdomestik/domain-case',
    forbiddenPathPart: 'domain-case',
  },
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walkFiles(root, results = []) {
  if (!fs.existsSync(root)) return results;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
      continue;
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

function assertBoundaryPackage(boundary, failures) {
  const packagePath = `${boundary.root}/package.json`;
  const indexPath = `${boundary.root}/src/index.ts`;
  const packageJson = readJson(packagePath);

  if (packageJson.name !== boundary.packageName) {
    failures.push(`${packagePath} must be named ${boundary.packageName}.`);
  }

  if (!fs.existsSync(path.join(repoRoot, indexPath))) {
    failures.push(`${indexPath} must exist as the public boundary entrypoint.`);
  }

  const dependencyBlocks = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
  ];

  if (dependencyBlocks.some(block => block && boundary.forbiddenPackage in block)) {
    failures.push(`${packagePath} must not depend on ${boundary.forbiddenPackage}.`);
  }
}

function assertNoCrossImports(boundary, failures) {
  const files = walkFiles(path.join(repoRoot, boundary.root, 'src'));

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const relativePath = toPosix(path.relative(repoRoot, file));
    if (source.includes(boundary.forbiddenPackage)) {
      failures.push(`${relativePath} imports forbidden ${boundary.forbiddenPackage}.`);
    }

    const relativeForbidden = new RegExp(`from ['"][^'"]*${boundary.forbiddenPathPart}`, 'u');
    if (relativeForbidden.test(source)) {
      failures.push(`${relativePath} imports through forbidden ${boundary.forbiddenPathPart}.`);
    }
  }
}

function assertRootPaths(failures) {
  const tsconfig = readJson('tsconfig.json');
  const paths = tsconfig.compilerOptions?.paths ?? {};

  for (const boundary of boundaries) {
    if (!paths[boundary.packageName] || !paths[`${boundary.packageName}/*`]) {
      failures.push(`tsconfig.json must map ${boundary.packageName} and subpaths.`);
    }
  }
}

function main() {
  const failures = [];

  for (const boundary of boundaries) {
    assertBoundaryPackage(boundary, failures);
    assertNoCrossImports(boundary, failures);
  }
  assertRootPaths(failures);

  if (failures.length > 0) {
    console.error('Case/recovery boundary guard failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Case/recovery boundary guard passed.');
}

main();
