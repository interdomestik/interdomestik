import { fileURLToPath } from 'node:url';
import { adapter } from './registry.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const filepath = fileURLToPath(new URL('./wrapper.test.mjs', import.meta.url));
const config = {
  root,
  setupFiles: [],
  name: undefined,
  passWithNoTests: false,
  allowOnly: false,
  sequence: { shuffle: false, concurrent: false, seed: 0, hooks: 'stack', setupFiles: 'list' },
  maxConcurrency: 1,
  testTimeout: 5000,
  hookTimeout: 5000,
  retry: 0,
  includeTaskLocation: false,
  tags: [],
  strictTags: false,
  expect: {},
  snapshotOptions: { expand: false },
};
globalThis.__vitest_worker__ = { config, filepath, providedContext: {}, metaEnv: {} };
globalThis.__vitest_mocker__ = adapter;
const { startTests, expect } = await import('./vendor.mjs');
const runner = {
  config,
  pool: 'sealed-single-process',
  async importFile(path, source) {
    if (path !== filepath || source !== 'collect') throw Error('Only fixed wrapper suite');
    await import('./wrapper.test.mjs');
  },
  onBeforeRunTask() {
    expect.setState({ assertionCalls: 0 });
  },
};
// In-process inspector: no debugger socket or external descriptor is opened.
const { Session } = await import('node:inspector');
const { readFileSync } = await import('node:fs');
const { createHash } = await import('node:crypto');
const session = new Session();
session.connect();
const post = (name, args = {}) =>
  new Promise((resolve, reject) =>
    session.post(name, args, (e, r) => (e ? reject(e) : resolve(r)))
  );
await post('Profiler.enable');
await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
let files, rawCoverage;
try {
  files = await startTests([filepath], runner);
  rawCoverage = await post('Profiler.takePreciseCoverage');
} finally {
  await post('Profiler.stopPreciseCoverage');
  await post('Profiler.disable');
  session.disconnect();
}
const wrapperUrl = new URL('./wrapper.mjs', import.meta.url).href;
const scripts = rawCoverage.result.filter(s => s.url === wrapperUrl);
if (scripts.length !== 1) throw Error('Expected exactly one actual wrapper coverage script');
const coverage = {
  version: 1,
  url: 'file:///capsule/wrapper.mjs',
  sourceSha256: createHash('sha256')
    .update(readFileSync(new URL('./wrapper.mjs', import.meta.url)))
    .digest('hex'),
  functions: scripts[0].functions,
};
const cases = [];
const suites = [];
function visit(task) {
  if (task.type === 'test')
    cases.push({
      name: task.name,
      state: task.result?.state,
      errors: task.result?.errors?.map(e => ({ name: e.name, message: e.message, stack: e.stack })),
      assertionCalls: task.result?.assertionCalls,
    });
  else {
    suites.push({ name: task.name, state: task.result?.state, errors: task.result?.errors });
    for (const child of task.tasks ?? []) visit(child);
  }
}
files.forEach(visit);
console.log(JSON.stringify({ kind: 'untrusted-wrapper-observations-v2', cases, suites, coverage }));
if (
  cases.length !== 9 ||
  cases.some(c => c.state !== 'pass') ||
  suites.some(s => s.state !== 'pass')
)
  process.exitCode = 1;
