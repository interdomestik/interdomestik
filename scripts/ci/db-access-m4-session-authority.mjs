import fs from 'node:fs';
import path from 'node:path';
import { ADOPTION } from './db-access-adoption.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { providerUnitResolverSnapshot } from './db-access-provider-unit-source.mjs';
import { verifyCurrentResolverSnapshot } from './db-access-resolver-snapshot.mjs';
import { digest, resolverFile, verifyResolverBoundary } from './db-access-trust.mjs';
import { outputShape } from './db-access-output-binding.mjs';

// Reuse the actual preparation's fixed authority checks, with fresh disk inputs.
// This computes data only; it cannot mint native/session/worker ownership.
export function currentM4SessionAuthority(prepared) {
  if (prepared.adoption !== ADOPTION || prepared.providerPolicy !== PROVIDER_UNIT_POLICY)
    throw Error('incomplete: M4 session foreign preparation authority');
  const root = fs.realpathSync(prepared.repoRoot);
  // Includes strict baseline bytes/mode/digest and all provider resolver records.
  const providerResolver = providerUnitResolverSnapshot(root, ADOPTION, PROVIDER_UNIT_POLICY);
  const currentResolver = verifyCurrentResolverSnapshot(root, ADOPTION);
  for (const [file, source] of providerResolver) currentResolver.set(file, source);
  // Returns every freshly read candidate package/config after existing validation.
  const candidates = verifyResolverBoundary(root, prepared.trusted, currentResolver);
  const select = sources => [...sources].filter(([file]) => resolverFile(file));
  const resolution = new Map(select(prepared.trusted));
  for (const [file, source] of providerResolver)
    if (file.endsWith('/package.json')) resolution.set(file, source);
  const resolutionDigest = outputShape([...resolution]).digest;
  if (
    outputShape(select(prepared.resolutionSources)).digest !== resolutionDigest ||
    outputShape(select(prepared.model.approvedSources)).digest !== resolutionDigest
  )
    throw Error('incomplete: M4 session parsed resolver inputs changed');
  // Current bytes of the complete fixed adoption/config authority are bookended,
  // including reviewed changes; this does not reclassify those changes as valid.
  const authorityFiles = Object.keys(ADOPTION.files).map(file => {
    const full = path.join(root, file);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch (error) {
      if (error.code === 'ENOENT') return [file, 'missing'];
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(full) !== full)
      throw Error('incomplete: M4 session non-regular authority input ' + file);
    return [file, stat.mode & 0o111 ? '100755' : '100644', digest(fs.readFileSync(full))];
  });
  return outputShape({
    adoption: ADOPTION,
    authorityFiles,
    currentResolver: [...currentResolver],
    candidates: [...candidates],
    trustedResolver: select(prepared.trusted),
    resolution: [...resolution],
  }).digest;
}
