import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const outputRoot = path.resolve('.vercel/output');
const outputRootPrefix = `${outputRoot}${path.sep}`;
const attestationPath = '.well-known/interdomestik-release-attestation.json';

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function resolveOutputPath(...segments) {
  const candidate = path.resolve(outputRoot, ...segments);
  if (candidate !== outputRoot && !candidate.startsWith(outputRootPrefix)) {
    throw new Error(`Refusing to read outside ${outputRoot}`);
  }
  return candidate;
}

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativeDir = path.relative(outputRoot, dir);
    const absolutePath = resolveOutputPath(relativeDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolutePath, files);
    } else if (entry.isFile()) {
      const relativePath = toPosixPath(path.relative(outputRoot, absolutePath));
      if (relativePath !== `static/${attestationPath}`) {
        files.push(relativePath);
      }
    }
  }
  return files;
}

if (!statSync(outputRoot).isDirectory()) {
  throw new Error(`${outputRoot} is not a directory`);
}

const digest = createHash('sha256');
for (const relativePath of collectFiles(outputRoot).sort((left, right) =>
  left.localeCompare(right)
)) {
  const absolutePath = resolveOutputPath(...relativePath.split('/'));
  const fileDigest = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
  digest.update(relativePath);
  digest.update('\0');
  digest.update(fileDigest);
  digest.update('\0');
}

process.stdout.write(`sha256:${digest.digest('hex')}\n`);
