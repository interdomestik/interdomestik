import fs from 'node:fs';
import path from 'node:path';

const TRUSTED_PATH_SEGMENTS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
];

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

export function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function resolveTrustedExecutable(candidates) {
  for (const segment of TRUSTED_PATH_SEGMENTS) {
    for (const candidate of candidates) {
      const candidatePath = path.join(segment, candidate);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  throw new Error(`trusted executable not found for candidates: ${candidates.join(', ')}`);
}
