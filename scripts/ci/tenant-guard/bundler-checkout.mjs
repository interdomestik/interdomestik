import fs from 'node:fs';
import path from 'node:path';
import { BUNDLER_CONFIG_NAME } from './bundler-closure.mjs';
import { workspaceDirs } from './resolution.mjs';
import { resolverPair } from './rules-resolver-state.mjs';

function matchesCheckout(full, text) {
  try {
    return fs.lstatSync(full).isFile() && fs.readFileSync(full).equals(Buffer.from(text, 'utf8'));
  } catch {
    return false;
  }
}

/** Bind the on-disk closure and direct config inventory to the authenticated candidate. */
export function bundlerCheckoutProblem(repoRoot, candidate) {
  const { bundler, reason } = resolverPair(candidate);
  if (reason) return null; // Resolver admission refuses an unbindable candidate.
  const closurePaths = new Set();
  for (const [file] of bundler.files) {
    closurePaths.add(file);
    const text = candidate.blobs.get(file) ?? candidate.allSources.get(file);
    if (!matchesCheckout(path.join(repoRoot, file), text))
      return `candidate: checkout differs from merge blob ${file}`;
  }
  // The closure grammar treats every direct executable config as a root.
  for (const dir of ['', ...workspaceDirs(repoRoot)]) {
    for (const name of fs.readdirSync(path.join(repoRoot, dir))) {
      const file = dir ? `${dir}/${name}` : name;
      if (BUNDLER_CONFIG_NAME.test(name) && !closurePaths.has(file))
        return `candidate: checkout bundler config not in the merge tree ${file}`;
    }
  }
  return null;
}
