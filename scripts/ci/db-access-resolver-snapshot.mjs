import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Protected executable-source data, separate from historical DB-debt ADOPTION.
// No candidate, environment or CLI input can select a dependency snapshot.
export const RESOLVER_SNAPSHOT = Object.freeze({
  id: 'dependency-security-20261021-exact-pair-v1',
  adoptionCommit: '278e33ab0dd448547fa81d4b0ff122b4d69c901e',
  adoptionTree: '4f9330417466b4f7bee68349e7183db22a5260ff',
  baselineSha256: '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9',
  files: Object.freeze({
    'pnpm-workspace.yaml': Object.freeze({
      previousSha256: '920dd84d8a781289481b1d24d0eb0713b1f950318ad85a0cad5663db67fd701e',
      sha256: '5faff92eccfa8046e549264091a50e895a954da7b4cfff9c76513f28f3e50e88',
      bytes: 1942,
    }),
    'pnpm-lock.yaml': Object.freeze({
      previousSha256: 'b63300c1333f2b89d2483e16967e006ff9ddaf585728e79a003250e699dbf91f',
      sha256: '221aac6195992ee283892ae9338a2ce880bd0f3d16f6915cbb4545209e494aca',
      bytes: 709858,
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
