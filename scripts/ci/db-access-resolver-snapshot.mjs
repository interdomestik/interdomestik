import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Protected executable-source data, separate from historical DB-debt ADOPTION.
// No candidate, environment or CLI input can select a dependency snapshot.
export const RESOLVER_SNAPSHOT = Object.freeze({
  id: 's8-next-security-20261026-exact-pair-v1',
  adoptionCommit: '278e33ab0dd448547fa81d4b0ff122b4d69c901e',
  adoptionTree: '4f9330417466b4f7bee68349e7183db22a5260ff',
  baselineSha256: '438b856b913d2946088b9c0f925dd07818b81ea82bad8d3468c2470a2f1131e9',
  files: Object.freeze({
    'pnpm-workspace.yaml': Object.freeze({
      previousSha256: '5faff92eccfa8046e549264091a50e895a954da7b4cfff9c76513f28f3e50e88',
      sha256: '692d5d04bb918d25cc1093e425970dcb7879af7da8d1f869d3388328e625815a',
      bytes: 1989,
    }),
    'pnpm-lock.yaml': Object.freeze({
      previousSha256: '221aac6195992ee283892ae9338a2ce880bd0f3d16f6915cbb4545209e494aca',
      sha256: '42f995ad77406c993e1a80b26f36306afbde4df7bf0a395b01ef80ddd5f3a7dc',
      bytes: 711992,
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
