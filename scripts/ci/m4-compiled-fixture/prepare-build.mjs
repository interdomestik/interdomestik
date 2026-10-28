// Build preparation only. Import this only after producer authentication by the existing owner.
import fs from 'node:fs';
import path from 'node:path';
import fixed from '../db-access-m4-compiled-contract.json' with { type: 'json' };
import { materializePackages } from './package-graph.mjs';
import { exact } from '../db-access-provider-runtime-identity.mjs';
import { verifySource } from './source-bookends.mjs';
import { ownedTarget, verifyInstalledClosure } from './preparation-custody.mjs';
export function prepareCompiledFixture({
  candidateRoot,
  producerRoot,
  compiledPackageRoot,
  ownedParent,
  targetName,
}) {
  if (
    typeof compiledPackageRoot !== 'string' ||
    !path.isAbsolute(compiledPackageRoot) ||
    fs.realpathSync(compiledPackageRoot) !== compiledPackageRoot ||
    fs.lstatSync(compiledPackageRoot).uid !== process.getuid() ||
    fs.lstatSync(compiledPackageRoot).mode & 0o077
  )
    throw Error('Protected owned compiler package source required');
  verifySource({ candidateRoot, producerRoot });
  const target = ownedTarget(ownedParent, targetName);
  fs.mkdirSync(target, { mode: 0o700 });
  const project = path.join(target, 'project');
  try {
    for (const file of Object.keys(fixed.projectFiles)) {
      const relative = file.slice('scripts/ci/m4-compiled-fixture/project/'.length);
      if (
        !relative ||
        relative.startsWith('/') ||
        relative.split('/').some(x => !x || x === '.' || x === '..')
      )
        throw Error('Fixed fixture project path refused');
      const destination = path.join(project, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const bytes = exact(producerRoot, file, fixed.projectFiles[file]);
      fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o644 });
    }
    verifySource({ candidateRoot, producerRoot }, project);
    const graph = materializePackages(path.join(compiledPackageRoot, 'apps/web'), project);
    if (graph.nodes.length !== fixed.installedClosure.packageCount)
      throw Error('Fixed package graph count');
    const installed = verifyInstalledClosure(project);
    for (const name of ['home', 'tmp']) fs.mkdirSync(path.join(target, name), { mode: 0o700 });
    fs.writeFileSync(
      path.join(target, 'installed-graph.json'),
      JSON.stringify(graph, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 }
    );
    const command = {
      argv: [
        process.execPath,
        path.join(project, 'node_modules/next/dist/bin/next'),
        'build',
        '--webpack',
      ],
      cwd: project,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: path.join(target, 'home'),
        TMPDIR: path.join(target, 'tmp'),
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        LANG: 'C.UTF-8',
        TZ: 'UTC',
      },
      parentOwnedGuardianRequired: true,
      prepOnly: true,
      nativeAdmission: false,
    };
    fs.writeFileSync(
      path.join(target, 'build-command.json'),
      JSON.stringify(command, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 }
    );
    verifySource({ candidateRoot, producerRoot }, project);
    return Object.freeze({
      target,
      installed,
      installedBytes: graph.copiedBytes,
      installedFiles: graph.copiedFiles,
      buildExecuted: false,
      runtimeAdmission: false,
      nativeAdmission: false,
    });
  } catch (error) {
    // Incomplete owned output is retained for the caller's explicit custody/cleanup.
    throw error;
  }
}
