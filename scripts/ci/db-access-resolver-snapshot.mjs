import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Protected executable-source data, separate from historical DB-debt ADOPTION.
// No candidate, environment or CLI input can select a dependency snapshot.
export const RESOLVER_SNAPSHOT = Object.freeze({
  id: 'handlebars-4.7.10-exact-pair-v1',
  adoptionCommit: '278e33ab0dd448547fa81d4b0ff122b4d69c901e',
  adoptionTree: '4f9330417466b4f7bee68349e7183db22a5260ff',
  baselineSha256: '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9',
  files: Object.freeze({
    'pnpm-workspace.yaml': Object.freeze({
      previousSha256: '920dd84d8a781289481b1d24d0eb0713b1f950318ad85a0cad5663db67fd701e',
      sha256: 'e6dfd3feb1ae3df7b34f41397bbef7b751e73d0e03a1a676eb0c8ad8db64b53c',
      bytes: 1471,
    }),
    'pnpm-lock.yaml': Object.freeze({
      previousSha256: 'b63300c1333f2b89d2483e16967e006ff9ddaf585728e79a003250e699dbf91f',
      sha256: '837c22b9c5acb1b62369691913e6fbb49bc5d95753801bbaa8db578aedaeef4a',
      bytes: 710365,
    }),
  }),
});

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
  for (const [file, expected] of Object.entries(RESOLVER_SNAPSHOT.files)) {
    const aliases = names.filter(name => name.normalize('NFC').toLowerCase() === file);
    const full = path.join(root, file);
    if (aliases.length !== 1 || aliases[0] !== file)
      throw new Error(`incomplete: resolver snapshot missing or ambiguous ${file}`);
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(full) !== full)
      throw new Error(`incomplete: resolver snapshot non-regular ${file}`);
    if (stat.size !== expected.bytes)
      throw new Error(`incomplete: resolver snapshot size mismatch ${file}`);
    const bytes = fs.readFileSync(full);
    if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256)
      throw new Error(`incomplete: resolver snapshot digest mismatch ${file}`);
    verified.set(file, bytes.toString('utf8'));
  }
  return verified;
}
