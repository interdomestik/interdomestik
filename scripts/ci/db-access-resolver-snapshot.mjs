import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LOCK_PROJECTION_ID, lockProjection } from './db-access-lock-projection.mjs';

// Protected executable-source data, separate from historical DB-debt ADOPTION.
// No candidate, environment or CLI input can select a dependency snapshot.
export const RESOLVER_SNAPSHOT = Object.freeze({
  id: 'dependency-lock-projection-20261122-v1',
  adoptionCommit: '278e33ab0dd448547fa81d4b0ff122b4d69c901e',
  adoptionTree: '4f9330417466b4f7bee68349e7183db22a5260ff',
  baselineSha256: '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9',
  files: Object.freeze({
    'pnpm-workspace.yaml': Object.freeze({
      previousSha256: '920dd84d8a781289481b1d24d0eb0713b1f950318ad85a0cad5663db67fd701e',
      sha256: 'b52884df2602693cdf9f55a3966da41025cf145c490b9339fd3b5d47af7ff1f6',
      bytes: 2105,
    }),
    // Pinned by its canonical projection: first-party workspace links are not part of it.
    'pnpm-lock.yaml': Object.freeze({
      projection: LOCK_PROJECTION_ID,
      previousSha256: '5afa99cf2e8b0a56f6d2bcc725cc8fae711407053e1b8af830d98248f5c3fc1c',
      sha256: '00c82dc7fc1d6a66a02722791b2460b002c17331259e3f62d10c7172df6aefa7',
      maxBytes: 8 * 1024 * 1024,
    }),
  }),
});

function projected(bytes, file) {
  try {
    return lockProjection(bytes).sha256;
  } catch {
    throw new Error(`incomplete: resolver snapshot unparseable ${file}`);
  }
}

// One pinned file: exact name, regular file, size, then digest (raw or projected); its bytes.
function verifiedFile(root, names, file, expected) {
  const aliases = names.filter(name => name.normalize('NFC').toLowerCase() === file);
  const full = path.join(root, file);
  if (aliases.length !== 1 || aliases[0] !== file)
    throw new Error(`incomplete: resolver snapshot missing or ambiguous ${file}`);
  const stat = fs.lstatSync(full);
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(full) !== full)
    throw new Error(`incomplete: resolver snapshot non-regular ${file}`);
  if (expected.projection === undefined && stat.size !== expected.bytes)
    throw new Error(`incomplete: resolver snapshot size mismatch ${file}`);
  if (
    expected.projection !== undefined &&
    (!Number.isSafeInteger(expected.maxBytes) || stat.size > expected.maxBytes)
  )
    throw new Error(`incomplete: resolver snapshot size bound exceeded ${file}`);
  const bytes = fs.readFileSync(full);
  const actual =
    expected.projection === undefined
      ? createHash('sha256').update(bytes).digest('hex')
      : projected(bytes, file);
  if (actual !== expected.sha256)
    throw new Error(`incomplete: resolver snapshot digest mismatch ${file}`);
  return bytes;
}

export function verifyCurrentResolverSnapshot(repoRoot, adoption) {
  if (
    adoption.commit !== RESOLVER_SNAPSHOT.adoptionCommit ||
    adoption.tree !== RESOLVER_SNAPSHOT.adoptionTree ||
    adoption.files['scripts/ci/db-access-baseline.json'] !== RESOLVER_SNAPSHOT.baselineSha256
  )
    throw new Error('incomplete: resolver snapshot adoption mismatch');
  const root = fs.realpathSync(repoRoot);
  const names = fs.readdirSync(root);
  const verified = new Map();
  for (const [file, expected] of Object.entries(RESOLVER_SNAPSHOT.files))
    verified.set(file, verifiedFile(root, names, file, expected).toString('utf8'));
  return verified;
}
