import { LEGACY_P2_SOURCE } from './source-fence.mjs';
// Fixed private input projection for the existing unchanged Linux backend.
// This is filesystem custody only, never source/event/runtime admission by itself.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { exact } from '../db-access-provider-runtime-identity.mjs';
const PREFIX = 'scripts/ci/p2/';
const views = new WeakMap();
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw Error('P2 fixed legacy bank refused: ' + reason);
};
const overlays = Object.freeze({
  'policy.json': 'legacy-bank/policy.json',
  'capsule-layout.json': 'legacy-bank/capsule-layout.json',
  'capsule/registry.mjs': 'legacy-bank/registry.mjs',
  'capsule/run-suite.mjs': 'legacy-bank/run-suite.mjs',
  'capsule/dist/wrapper.original.ts': 'legacy-bank/dist/wrapper.original.ts',
  'capsule/dist/wrapper.source.ts': 'legacy-bank/dist/wrapper.source.ts',
  'capsule/dist/wrapper.mjs': 'legacy-bank/dist/wrapper.mjs',
  'capsule/dist/wrapper.js.map': 'legacy-bank/dist/wrapper.js.map',
  'capsule/dist/wrapper.test.original.ts': 'legacy-bank/dist/wrapper.test.original.ts',
  'capsule/dist/wrapper.test.source.ts': 'legacy-bank/dist/wrapper.test.source.ts',
  'capsule/dist/wrapper.test.mjs': 'legacy-bank/dist/wrapper.test.mjs',
  'capsule/dist/wrapper.test.js.map': 'legacy-bank/dist/wrapper.test.js.map',
});
export function materializeFixedLegacyBank(producerRoot, outputRoot, sourceRecords) {
  const producer = fs.realpathSync(producerRoot),
    output = fs.realpathSync(outputRoot);
  if (
    producer !== producerRoot ||
    output !== outputRoot ||
    producer === output ||
    producer.startsWith(output + path.sep) ||
    output.startsWith(producer + path.sep)
  )
    fail('canonical disjoint projection roots');
  const root = path.join(output, 'legacy-bank-inputs-' + randomUUID());
  fs.mkdirSync(root, { mode: 0o700 });
  const mappings = Object.fromEntries(
    Object.entries(sourceRecords)
      .filter(([file]) => file.startsWith(PREFIX))
      .map(([file, descriptor]) => [file, { file, descriptor: { ...descriptor } }])
  );
  for (const [target, source] of Object.entries(overlays)) {
    const file = PREFIX + source,
      descriptor = sourceRecords[file];
    if (!descriptor) fail('missing literal bank input ' + file);
    mappings[PREFIX + target] = { file, descriptor: { ...descriptor } };
  }
  for (const [target, { file, descriptor }] of Object.entries(mappings)) {
    const bytes = exact(producerRoot, file, descriptor),
      dest = path.join(root, target);
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    fs.writeFileSync(dest, bytes, {
      flag: 'wx',
      mode: descriptor.mode === '100755' ? 0o755 : 0o644,
    });
  }
  const handle = Object.freeze({ root, kind: 'fixed-original-factory-nine-input-projection' });
  const records = Object.fromEntries(
    Object.entries(mappings).map(([file, row]) => [file, row.descriptor])
  );
  views.set(handle, { producerRoot, mappings, records });
  assertFixedLegacyBankCurrent(handle);
  return handle;
}
export function assertFixedLegacyBankCurrent(handle) {
  const state = views.get(handle);
  if (!state) fail('foreign input projection');
  const files = [],
    directories = [],
    expectedDirectories = new Set();
  for (const [file, { file: source, descriptor }] of Object.entries(state.mappings)) {
    exact(state.producerRoot, source, descriptor);
    exact(handle.root, file, descriptor);
    let parent = path.posix.dirname(file);
    while (parent !== '.') {
      expectedDirectories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  function walk(relative = '') {
    for (const name of fs.readdirSync(path.join(handle.root, relative))) {
      const file = relative ? relative + '/' + name : name,
        st = fs.lstatSync(path.join(handle.root, file));
      if (st.isSymbolicLink()) fail('projection symlink');
      if (st.isDirectory()) {
        directories.push(file);
        walk(file);
      } else if (st.isFile()) files.push(file);
      else fail('projection kind');
    }
  }
  walk();
  if (
    JSON.stringify(files.sort()) !== JSON.stringify(Object.keys(state.records).sort()) ||
    JSON.stringify(directories.sort()) !== JSON.stringify([...expectedDirectories].sort())
  )
    fail('exact projected file/directory census');
  return hash(JSON.stringify(state.mappings));
}
export function legacyBankPartition(globalPartition) {
  const current = 'apps/web/src/server/operations/m4-qualification-admin-assignment.test.ts',
    legacy = 'apps/web/src/actions/admin-claims/assign.wrapper.test.ts';
  if (
    JSON.stringify(globalPartition.capsule) !== JSON.stringify([current, legacy]) ||
    !Array.isArray(globalPartition.ambient) ||
    globalPartition.ambient.some(file => file === current || file === legacy)
  )
    fail('complete two-bank partition');
  return Object.freeze({
    capsule: Object.freeze([legacy]),
    siblingCapsules: Object.freeze([current]),
    globalCapsule: globalPartition.capsule,
    ambient: globalPartition.ambient,
  });
}

export function validateLegacyCapsule(root, mainPolicy) {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'policy.json')));
  const sourceFiles = Object.fromEntries(
    [LEGACY_P2_SOURCE, 'apps/web/src/actions/admin-claims/assign.core.ts'].map(file => [
      file,
      mainPolicy.sourceFiles[file],
    ])
  );
  if (
    policy.scope !== 'exact-original-admin-wrapper-nine' ||
    JSON.stringify(policy.sourceFiles) !== JSON.stringify(sourceFiles)
  )
    fail('literal legacy source policy');
  for (const key of [
    'version',
    'repository',
    'officialImage',
    'nodeVersion',
    'architectures',
    'qualification',
    'baseline',
    'rootfs',
    'dispatchFiles',
  ])
    if (JSON.stringify(policy[key]) !== JSON.stringify(mainPolicy[key]))
      fail('legacy bank changed isolation policy ' + key);
  const oracle = JSON.parse(
    fs.readFileSync(path.join(root, 'legacy-bank/dist/source-manifest.json'))
  );
  if (
    JSON.stringify(oracle.sourceFiles) !== JSON.stringify(sourceFiles) ||
    oracle.tests.length !== 9 ||
    oracle.mockSpecifiers.length !== 6
  )
    fail('closed legacy oracle');
  for (const [file, name] of [
    [LEGACY_P2_SOURCE, 'wrapper.test'],
    ['apps/web/src/actions/admin-claims/assign.core.ts', 'wrapper'],
  ]) {
    const original = fs.readFileSync(
        path.join(root, 'capsule/dist', name + '.original.ts'),
        'utf8'
      ),
      generated = fs.readFileSync(path.join(root, 'capsule/dist', name + '.source.ts'), 'utf8');
    if (hash(original) !== sourceFiles[file]) fail('legacy original source');
    for (const segment of oracle.retainedSegments.filter(row => row.file === file)) {
      const text = original.slice(segment.start, segment.end);
      if (
        hash(text) !== segment.sha256 ||
        generated.slice(segment.generatedStart, segment.generatedEnd) !== text
      )
        fail('legacy retained source');
    }
  }
  return oracle;
}
