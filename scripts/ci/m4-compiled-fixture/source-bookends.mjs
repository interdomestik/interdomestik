// Source observations only; the authenticated caller supplies the candidate and producer roots.
import fs from 'node:fs';
import { exact } from '../db-access-provider-runtime-identity.mjs';
import fixed from '../db-access-m4-compiled-contract.json' with { type: 'json' };
import { deriveM4CompiledFixtureSource } from '../db-access-m4-compiled-source.mjs';
export function verifySource({ candidateRoot, producerRoot }, project) {
  const result = deriveM4CompiledFixtureSource({ candidateRoot, producerRoot });
  if (project) {
    if (fs.realpathSync(project) !== project) throw Error('Physical fixture project required');
    const prefix = 'scripts/ci/m4-compiled-fixture/project/';
    for (const [file, descriptor] of Object.entries(fixed.projectFiles)) {
      if (!file.startsWith(prefix)) throw Error('Fixed fixture project path refused');
      exact(project, file.slice(prefix.length), descriptor);
    }
  }
  return result;
}
