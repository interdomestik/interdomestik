import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  assertManagedPath,
  prepareManagedSubdirectory,
  trustedHomeDirectory,
} from './managed-paths.mjs';
import { safeId } from './z620-runner-lib.mjs';

const MANAGED_ROOTS = {
  cache: ['ci/interdomestik/cache/turbo', 'cache', 'Cache'],
  runs: ['ci/interdomestik/runs', 'runs', 'Runs'],
  state: ['ci/interdomestik/state', 'state', 'State'],
};

function accountHome(homeDir) {
  return homeDir ? path.resolve(homeDir) : trustedHomeDirectory();
}

function evidenceContext(value, root, homeDir) {
  const home = accountHome(homeDir);
  const rootAnchor = path.resolve(root);
  const localRoot = path.resolve(root, 'tmp/z620-gates');
  const runsRoot = path.resolve(home, 'ci/interdomestik/runs');
  const requested = path.resolve(String(value || localRoot));
  const candidate =
    requested === localRoot
      ? path.join(localRoot, `run-${process.pid}-${randomUUID()}`)
      : requested;
  const localRelative = path.relative(localRoot, candidate);
  if (
    localRelative &&
    !localRelative.startsWith('..') &&
    !path.isAbsolute(localRelative) &&
    !localRelative.includes(path.sep)
  ) {
    safeId(localRelative, 'local evidence run id');
    assertManagedPath(candidate, rootAnchor);
    return { anchor: rootAnchor, directory: candidate, runId: null };
  }
  const relative = path.relative(runsRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Evidence directory must stay inside the managed evidence root');
  }
  if (relative.includes(path.sep)) {
    throw new Error('Evidence directory must be a direct child of the managed runs root');
  }
  const runId = safeId(relative, 'evidence run id');
  assertManagedPath(candidate, home);
  return { anchor: home, directory: candidate, runId };
}

export function resolveEvidenceDirectory(value, root, homeDir) {
  return evidenceContext(value, root, homeDir).directory;
}

export function evidenceRunId(directory, root, homeDir) {
  return evidenceContext(directory, root, homeDir).runId;
}

export function evidenceDirectoryForRunId(runId, root, homeDir) {
  const home = accountHome(homeDir);
  return resolveEvidenceDirectory(
    path.join(home, 'ci/interdomestik/runs', safeId(runId, 'evidence run id')),
    root,
    home
  );
}

export function prepareEvidenceSubdirectory(value, name, root, homeDir, options) {
  const context = evidenceContext(value, root, homeDir);
  return prepareManagedSubdirectory(context.directory, name, context.anchor, options);
}

function managedRootContext(value, root, homeDir, kind) {
  const [suffix, localName, label] = MANAGED_ROOTS[kind];
  const home = accountHome(homeDir);
  const hostRoot = path.resolve(home, suffix);
  const rootAnchor = path.resolve(root);
  const localRoot = path.resolve(rootAnchor, `tmp/z620-${localName}`);
  const candidate = path.resolve(String(value || hostRoot));
  if (candidate === hostRoot) {
    return { anchor: home, directory: assertManagedPath(candidate, home) };
  }
  if (candidate === localRoot) {
    return { anchor: rootAnchor, directory: assertManagedPath(candidate, rootAnchor) };
  }
  throw new Error(`${label} directory must equal a managed ${kind} root`);
}

function resolveManagedRoot(value, root, homeDir, kind) {
  return managedRootContext(value, root, homeDir, kind).directory;
}

export function resolveStateRoot(value, root, homeDir) {
  return resolveManagedRoot(value, root, homeDir, 'state');
}

export function resolveRunsRoot(value, root, homeDir) {
  return resolveManagedRoot(value, root, homeDir, 'runs');
}

export function resolveCacheRoot(value, root, homeDir) {
  return resolveManagedRoot(value, root, homeDir, 'cache');
}

export function prepareCacheNamespace(value, namespace, root, homeDir) {
  const context = managedRootContext(value, root, homeDir, 'cache');
  return prepareManagedSubdirectory(
    context.directory,
    safeId(namespace, 'cache namespace'),
    context.anchor,
    { fresh: true }
  );
}

export function gateEnvironment(environment, runId) {
  const childEnvironment = { ...environment, CI: 'true' };
  delete childEnvironment.Z620_EVIDENCE_DIR;
  delete childEnvironment.Z620_EVIDENCE_RUN_ID;
  if (runId) childEnvironment.Z620_EVIDENCE_RUN_ID = safeId(runId, 'evidence run id');
  return childEnvironment;
}

export function resourceGateArguments(options, root, homeDir) {
  const lanes = String(options.lanes || 'database,build,e2e-pr,e2e-merge,pilot')
    .split(',')
    .map(lane => safeId(lane, 'lane'))
    .join(',');
  const evidenceDir = resolveEvidenceDirectory(options['evidence-dir'], root, homeDir);
  const args = [
    path.join(root, 'scripts/ci/z620-gate-run.mjs'),
    `--lanes=${lanes}`,
    `--evidence-dir=${evidenceDir}`,
  ];
  if (options['include-conditional']) {
    if (!['true', 'false'].includes(options['include-conditional'])) {
      throw new Error('include-conditional must be true or false');
    }
    if (options['include-conditional'] === 'true') args.push('--include-conditional=true');
  }
  return { command: process.execPath, args, evidenceDir, lanes };
}
