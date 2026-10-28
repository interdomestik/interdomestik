import fs from 'node:fs';
import path from 'node:path';
import { verifySource } from './m4-compiled-fixture/source-bookends.mjs';
import {
  ownedDirectory,
  writePrivate,
  readFixed,
  imageSnapshot,
  browserSnapshot,
  sha,
  remaining,
  databaseCA,
  packageSourceBookend,
} from './db-access-m4-platform-custody.mjs';
import { verifyPlatformTools } from './db-access-m4-platform-tools.mjs';
import { preparePlatformTLS, verifyPlatformNssAfter } from './db-access-m4-platform-tls.mjs';
import { runKernelControls, runLoaderControls } from './db-access-m4-platform-controls.mjs';
import {
  freePort,
  runTLSControls,
  executeFourBrowserCases,
} from './db-access-m4-platform-browser.mjs';
import { startNext, buildNextImage } from './db-access-m4-platform-next.mjs';

const owned = new WeakMap();
function get(handle) {
  const state = owned.get(handle);
  if (!state) throw Error('Foreign compiled platform handle');
  return state;
}
function bookend(state) {
  remaining(state.deadlineAt);
  verifySource(
    { candidateRoot: state.candidateRoot, producerRoot: state.producerRoot },
    state.code
  );
  const image = imageSnapshot(state.code, state.imagePin),
    browser = browserSnapshot(),
    tools = verifyPlatformTools();
  if (
    JSON.stringify(image) !== JSON.stringify(state.image) ||
    JSON.stringify(browser) !== JSON.stringify(state.browser) ||
    JSON.stringify(tools) !== JSON.stringify(state.tools)
  )
    throw Error('Fresh platform bookend mismatch');
  const sourcePackages = packageSourceBookend(
    state.compiledPackageRoot,
    state.packageGraph,
    state.imageFiles
  );
  if (JSON.stringify(sourcePackages) !== JSON.stringify(state.sourcePackages))
    throw Error('Compiler source packages changed');
  for (const [file, digest] of state.inputs)
    if (sha(readFixed(file)) !== digest) throw Error('Private platform input changed');
  return { image, browser, tools, inputs: Object.fromEntries(state.inputs) };
}
const capture = (state, file) => {
  state.inputs.set(file, sha(readFixed(file)));
  return file;
};

export async function prepareM4CompiledPlatform({
  root,
  producerRoot,
  candidateRoot,
  workRoot,
  deadlineAt,
  layout,
  databaseTLS,
  compiledPackageRoot,
}) {
  remaining(deadlineAt);
  databaseCA(databaseTLS);
  for (const directory of [root, workRoot, ...Object.values(layout)]) ownedDirectory(directory);
  const names = [
    'backend-inputs',
    'browser-inputs',
    'browser-output',
    'browser-profiles',
    'driver-evidence',
    'next-cache',
    'next-inputs',
    'next-logs',
  ];
  if (
    Object.keys(layout).sort().join('|') !== names.join('|') ||
    names.some(name => layout[name] !== path.join(workRoot, name)) ||
    root === workRoot ||
    root.startsWith(workRoot + '/') ||
    workRoot.startsWith(root + '/')
  )
    throw Error('Fixed separated platform layout required');
  const state = {
    root,
    producerRoot,
    candidateRoot,
    workRoot,
    deadlineAt,
    layout,
    compiledPackageRoot,
    phase: 'preparing',
    children: new Set(),
    inputs: new Map(),
    consumed: false,
  };
  const handle = Object.freeze({});
  owned.set(handle, state);
  try {
    state.tools = verifyPlatformTools();
    state.browser = browserSnapshot();
    state.nextHome = path.join(layout['next-logs'], 'home');
    state.nextTmp = path.join(layout['next-logs'], 'tmp');
    state.browserHome = path.join(layout['browser-inputs'], 'home');
    state.browserTmp = path.join(layout['browser-inputs'], 'tmp');
    for (const directory of [state.nextHome, state.nextTmp, state.browserHome, state.browserTmp])
      fs.mkdirSync(directory, { mode: 0o700 });
    state.cleanEnv = {
      PATH: '/usr/bin:/bin',
      HOME: state.browserHome,
      TMPDIR: state.browserTmp,
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
    };
    Object.assign(
      state,
      await buildNextImage({
        candidateRoot,
        producerRoot,
        compiledPackageRoot,
        workRoot,
        layout,
        deadlineAt,
      })
    );
    const fixed = JSON.parse(
      readFixed(path.join(producerRoot, 'scripts/ci/db-access-m4-compiled-contract.json'))
    );
    const sourceNames = [
      'app/actions.js',
      ...fixed.vendorCorrespondence.map(row =>
        row.producer.slice('scripts/ci/m4-compiled-fixture/project/'.length)
      ),
    ];
    if (
      sourceNames.length !== 9 ||
      new Set(sourceNames).size !== 9 ||
      sourceNames.some(name => state.imageFiles[name]?.kind !== 'file')
    )
      throw Error('Nine actual compiled source inputs required');
    state.sourceInputs = Object.fromEntries(
      sourceNames.map(name => [name, { ...state.imageFiles[name] }])
    );
    state.imageDescriptor = capture(
      state,
      writePrivate(
        layout['next-inputs'],
        'image.json',
        JSON.stringify({ root: state.code, manifestSha256: state.imagePin })
      )
    );
    state.tls = await preparePlatformTLS(state, databaseTLS);
    for (const file of [
      state.tls.next.keyFile,
      state.tls.next.caFile,
      ...Object.values(state.tls.next.certFiles),
      state.tls.backend.caFile,
    ])
      capture(state, file);
    state.kernel = await runKernelControls(state);
    state.phase = 'prepared';
    state.before = bookend(state);
    return handle;
  } catch (error) {
    state.failure = error;
    try {
      await closeM4CompiledPlatform(handle);
    } catch {}
    owned.delete(handle);
    throw error;
  }
}
export function m4CompiledBackendLaunch(handle) {
  const state = get(handle);
  if (state.phase !== 'prepared' || state.backendTaken)
    throw Error('One prepared backend launch required');
  state.backendTaken = true;
  return Object.freeze({
    caFile: state.tls.backend.caFile,
    tls: Object.freeze({ ...state.tls.backend.tls }),
  });
}
export async function startM4CompiledNext(handle, { ownerOrigin, plan, cookies }) {
  const state = get(handle);
  if (state.phase !== 'prepared' || !state.backendTaken)
    throw Error('Prepared strict owner required');
  state.phase = 'starting';
  try {
    const origin = new URL(ownerOrigin);
    if (
      origin.protocol !== 'https:' ||
      origin.hostname !== '127.0.0.1' ||
      !origin.port ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      origin.username ||
      origin.password
    )
      throw Error('Actual strict owner origin required');
    if (JSON.stringify(plan).length > 32768 || JSON.stringify(cookies).length > 32768)
      throw Error('Bounded serialized platform startup required');
    state.planFile = capture(
      state,
      writePrivate(state.layout['next-inputs'], 'plan.json', JSON.stringify(plan))
    );
    state.cookieFile = capture(
      state,
      writePrivate(state.layout['browser-inputs'], 'cookies.json', JSON.stringify(cookies))
    );
    const ownerPort = Number(origin.port);
    state.loader = await runLoaderControls(state, ownerPort);
    state.tlsControls = await runTLSControls(state, ownerPort);
    const port = await freePort();
    state.next = await startNext(state, 'good', port, ownerPort);
    state.nextOrigin = 'https://127.0.0.1:' + port;
    state.phase = 'running';
  } catch (error) {
    state.failure = error;
    throw error;
  }
}
export async function runM4CompiledBrowser(handle) {
  const state = get(handle);
  if (state.phase !== 'running') throw Error('Fresh actual Next execution required');
  state.phase = 'browser-running';
  try {
    state.browserExecution = await executeFourBrowserCases(state);
    state.phase = 'browser-complete';
    return state.browserExecution.browser;
  } catch (error) {
    state.failure = error;
    throw error;
  }
}
export function closeM4CompiledPlatform(handle) {
  const state = get(handle);
  return (state.closing ??= (async () => {
    const complete = state.phase === 'browser-complete';
    const results = await Promise.allSettled([...state.children].map(child => child.stop()));
    state.children.clear();
    if (results.some(result => result.status !== 'fulfilled'))
      state.failure ??= Error('Platform drain failed');
    if (!state.failure && complete) {
      try {
        state.nssAfter = await verifyPlatformNssAfter(state);
        state.after = bookend(state);
      } catch (error) {
        state.failure = error;
      }
    }
    state.phase = 'closed';
    state.executed = complete && !state.failure;
    if (state.failure) throw state.failure;
  })());
}
export function takeM4CompiledPlatformEvidence(handle) {
  const state = get(handle);
  if (state.phase !== 'closed' || !state.executed || state.consumed || state.failure)
    throw Error('Fresh closed compiled platform execution required');
  bookend(state);
  state.consumed = true;
  return Object.freeze({
    version: 1,
    actionMap: state.image.actionMap.exports,
    sourceInputs: state.sourceInputs,
    image: state.image,
    browser: state.browser,
    tools: state.tools,
    packageSource: state.sourcePackages,
    kernel: state.kernel,
    loader: state.loader,
    tls: state.tlsControls,
    certificateIdentities: {
      issuerSha256: state.tls.issuerSha256,
      databaseCASha256: state.tls.databaseCASha256,
      leafHashes: state.tls.leafHashes,
      profiles: state.nssAfter,
    },
    reporter: state.browserExecution.reporter,
    browserObservationsSha256: state.browserExecution.observationsSha256,
    sourceImageBookends: { before: state.before, after: state.after },
    cleanup: { drained: true },
    runtimeAdmission: false,
    nativeAdmission: false,
    hostedQualification: false,
    productionCCredit: 0,
  });
}
