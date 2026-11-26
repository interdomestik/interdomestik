import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeAliasReceipt } from '../vercel-staging-alias-state.mjs';
import { validatePreimageReceipt } from '../configure-vercel-gate-url.mjs';
import { MIGRATIONS_DIR, readExpectedLedger } from '../runtime-attestation/journal.mjs';
import { output, readContext, readManifest } from './context.mjs';
import { digest } from './proof.mjs';

const git = args => execFileSync('/usr/bin/git', args, { stdio: ['ignore', 'pipe', 'ignore'] });
const readAtCommit = (sha, file) => git(['show', `${sha}:${MIGRATIONS_DIR}/${file}`]);

function predecessorCompatible(context, manifest, preimage) {
  const { commitSha } = preimage;
  git(['merge-base', '--is-ancestor', commitSha, context.commitSha]);
  const current = readExpectedLedger(process.cwd());
  const { beforeCount, journalSha256, ledgerSha256 } = manifest.plan;
  if (current.journalSha256 !== journalSha256 || !Number.isSafeInteger(beforeCount)) return false;
  const entries = current.entries.map(({ tag, when, hash }, idx) => ({ tag, idx, when, hash }));
  if (digest(JSON.stringify(entries)) !== ledgerSha256) return false;
  const previous = JSON.parse(readAtCommit(commitSha, 'meta/_journal.json').toString('utf8'));
  return (
    Array.isArray(previous.entries) &&
    previous.entries.length === beforeCount &&
    previous.entries.every(
      ({ idx, tag, when }, index) =>
        idx === index &&
        tag === entries[index]?.tag &&
        when === entries[index].when &&
        digest(readAtCommit(commitSha, `${tag}.sql`).toString('utf8')) === entries[index].hash
    )
  );
}

let permitted = false;
try {
  const context = readContext();
  const manifest = readManifest(process.env.RELEASE_MANIFEST, context);
  const preimage = validatePreimageReceipt(
    JSON.parse(readFileSync(process.env.STAGING_PREIMAGE_RECEIPT_PATH, 'utf8'))
  );
  if (context.environment === 'staging' && context.attempt === '1')
    permitted = predecessorCompatible(context, manifest, preimage);
} catch {
  // Unknown compatibility with the live prefix is a refusal.
}
if (!permitted) {
  await writeAliasReceipt(process.env.STAGING_ROLLBACK_RECEIPT_PATH, {
    alias: 'staging.interdomestik.com',
    outcome: 'refused',
    reason: 'PREDECESSOR_COMPATIBILITY_UNPROVEN',
  });
}
output('compatible', String(permitted));
