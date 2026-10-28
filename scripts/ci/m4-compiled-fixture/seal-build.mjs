// Preparation image descriptor only; this is not a runtime acceptance path.
import fs from 'node:fs';
import path from 'node:path';
import { verifySource } from './source-bookends.mjs';
import { census, hashFile } from './project/image-custody.mjs';
import { ownedTarget, verifyInstalledClosure } from './preparation-custody.mjs';
export function assertBuiltActionSurface(actions, manifest, required) {
  const ids = Object.keys(actions.exports ?? {}).sort();
  const names = Object.values(actions.exports ?? {}).sort();
  if (
    !manifest.node ||
    typeof manifest.node !== 'object' ||
    Array.isArray(manifest.node) ||
    !manifest.edge ||
    typeof manifest.edge !== 'object' ||
    Array.isArray(manifest.edge) ||
    ids.length !== 3 ||
    JSON.stringify(names) !==
      JSON.stringify(['runAdminAssignment', 'runAgentAssignment', 'runStaffAssignment']) ||
    JSON.stringify(Object.keys(manifest.node ?? {}).sort()) !== JSON.stringify(ids) ||
    Object.keys(manifest.edge ?? {}).length !== 0 ||
    required.config?.experimental?.serverActions?.bodySizeLimit !== '2mb' ||
    ids.some(id => !Object.keys(manifest.node[id].workers ?? {}).length)
  )
    throw Error('Built action surface refused');
}
export function sealCompiledBuild({ candidateRoot, producerRoot, ownedParent, targetName }) {
  const target = ownedTarget(ownedParent, targetName, true);
  verifySource({ candidateRoot, producerRoot });
  const root = path.join(target, 'project'),
    dist = path.join(root, '.next');
  const installed = verifyInstalledClosure(root);
  const buildId = fs.readFileSync(path.join(dist, 'BUILD_ID'), 'utf8').trim();
  if (!buildId || buildId.length > 256) throw Error('Fresh Next build ID absent');
  const actions = JSON.parse(fs.readFileSync(path.join(dist, 'server/m4-action-map.json')));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dist, 'server/server-reference-manifest.json'))
  );
  const required = JSON.parse(fs.readFileSync(path.join(dist, 'required-server-files.json')));
  if (actions.sourceSha256 !== hashFile(path.join(root, 'app/actions.js')))
    throw Error('Built action mapping refused');
  assertBuiltActionSurface(actions, manifest, required);
  verifySource({ candidateRoot, producerRoot }, root);
  const value = {
    version: 1,
    qualificationOnly: true,
    nextVersion: '16.4.3',
    buildId,
    actionMap: actions,
    files: census(root),
    installedClosure: installed,
    installedGraphSha256: hashFile(path.join(target, 'installed-graph.json')),
    node: {
      version: process.version,
      executableSha256: hashFile(process.execPath),
    },
    runtimeInputContainmentQualified: false,
    browserTrustQualified: false,
    strictDatabaseTLSQualified: false,
    hostedQualified: false,
    productionCCredit: 0,
  };
  const file = path.join(root, 'm4-build-image.json');
  fs.writeFileSync(file, JSON.stringify(value) + '\n', {
    flag: 'wx',
    mode: 0o444,
  });
  return Object.freeze({
    manifestSha256: hashFile(file),
    buildId,
    actionCount: Object.keys(actions.exports).length,
    runtimeExecuted: false,
    runtimeAdmission: false,
    qualification: false,
  });
}
