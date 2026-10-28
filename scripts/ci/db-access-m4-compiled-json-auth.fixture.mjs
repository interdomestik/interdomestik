// Local protocol fixture only: real fixed source modules, never runtime admission.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { makeCompiledAuthFixture } from './db-access-m4-compiled-auth.fixture.mjs';

export function compiledJsonFixture(mutate = () => {}) {
  const fixture = makeCompiledAuthFixture();
  const policyFile = path.join(fixture.root, 'scripts/ci/db-access-provider-unit-policy.json');
  const policy = JSON.parse(fs.readFileSync(policyFile));
  const put = (name, bytes, declared = true) => {
    const relative = 'scripts/ci/' + name;
    fs.writeFileSync(path.join(fixture.root, relative), bytes);
    if (declared)
      policy.producerFiles[relative] = {
        mode: '100644',
        bytes: Buffer.byteLength(bytes),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
  };
  try {
    for (const name of [
      'db-access-m4-compiled-source.mjs',
      'db-access-m4-compiled-contract.json',
      'db-access-provider-runtime-identity.mjs',
      'db-access-git-blob-batch.mjs',
    ])
      put(name, fs.readFileSync(path.join(fixture.sourceRoot, 'scripts/ci', name)));
    const runtime = 'db-access-m4-compiled-runtime.mjs';
    put(
      runtime,
      "import './db-access-m4-compiled-source.mjs';\n" +
        fs.readFileSync(path.join(fixture.root, 'scripts/ci', runtime), 'utf8')
    );
    mutate({ fixture, policy, put });
    fs.writeFileSync(policyFile, JSON.stringify(policy));
    const git = args =>
      execFileSync(
        '/usr/bin/git',
        [
          '-C',
          fixture.root,
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        {
          encoding: 'utf8',
          env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      ).trim();
    git(['add', 'scripts']);
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'declared actual source JSON chain',
    ]);
    const commit = git(['rev-parse', 'HEAD']),
      tree = git(['rev-parse', 'HEAD^{tree}']);
    git(['update-ref', 'refs/protected/main', commit]);
    Object.assign(fixture.options.context, {
      baseCommit: commit,
      headCommit: commit,
      candidateCommit: commit,
      candidateTree: tree,
      sourceCommit: commit,
      sourceTree: tree,
      protectedMain: commit,
    });
    return fixture;
  } catch (error) {
    fixture.cleanup();
    throw error;
  }
}
