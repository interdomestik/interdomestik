import { resolve } from 'node:path';

// prettier-ignore
import { CorpusFault, type CorpusFsOps, type CorpusHandle, type CorpusStage, type CorpusStat } from './migration-corpus-contracts';
import { corpusChild } from './migration-corpus-root';

type Ops = Readonly<CorpusFsOps>;
type Opened = Readonly<{ name: string; handle: CorpusHandle }>;
const STAT_KEYS = ['dev', 'ino', 'nlink', 'size', 'mtimeNs', 'ctimeNs', 'kind'] as const;
export type CorpusDirectories = Readonly<{
  realRoot: string;
  metaPath: string;
  rootIdentity: CorpusStat;
  rootSnapshot: readonly string[];
}>;

function same(left: CorpusStat, right: CorpusStat): boolean {
  return STAT_KEYS.every(key => left[key] === right[key]);
}

async function stage(ops: Ops, name: string, value: CorpusStage) {
  await ops.onStage?.(value, name);
}

async function snapshot(path: string, maximum: number, ops: Ops): Promise<readonly string[]> {
  const stream = await ops.streamDirectory(path);
  const entries: string[] = [];
  let bytes = 0;
  let fault: unknown;
  try {
    for await (const entry of stream) {
      const length = Buffer.byteLength(entry.name, 'utf8');
      bytes += length;
      if (length > 255 || bytes > 32_768 || entries.length >= maximum) {
        throw new CorpusFault('MIGRATION_CORPUS_ROOT_REJECTED');
      }
      entries.push(`${entry.name}:${entry.kind}`);
    }
  } catch (error) {
    fault = error;
  } finally {
    try {
      await stream.close();
    } catch {
      fault = new CorpusFault('MIGRATION_CORPUS_CLEANUP_FAILED');
    }
  }
  if (fault) throw fault;
  entries.sort((left, right) => left.localeCompare(right));
  return Object.freeze(entries);
}

async function openDirectory(path: string, name: string, ops: Ops, opened: Opened[]) {
  await stage(ops, name, 'before_lstat');
  const before = await ops.lstatBigint(path);
  if (before.kind !== 'directory') throw new CorpusFault('MIGRATION_CORPUS_ROOT_REJECTED');
  await stage(ops, name, 'after_lstat');
  if ((await ops.realpath(path)) !== path) throw new CorpusFault('MIGRATION_CORPUS_ROOT_REJECTED');
  const handle = await ops.openDirectory(path);
  opened.push({ name, handle });
  await stage(ops, name, 'after_open');
  if (!same(before, await handle.fstatBigint())) {
    throw new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
  }
  return { before, handle };
}

// prettier-ignore
const attempt = (task: () => Promise<void>) => task().then(() => true, () => false);

async function closeAll(opened: readonly Opened[], ops: Ops): Promise<boolean> {
  let failed = false;
  for (const item of [...opened].reverse()) {
    failed = !(await attempt(() => stage(ops, item.name, 'before_close'))) || failed;
    failed = !(await attempt(() => item.handle.close())) || failed;
  }
  return failed;
}

// prettier-ignore
async function postcheck(path: string, name: string, prior: readonly string[], before: CorpusStat, handle: CorpusHandle, maximum: number, ops: Ops) {
  await stage(ops, name, 'before_postcheck');
  const current = await snapshot(path, maximum, ops);
  // prettier-ignore
  const [after, real, descriptor] = await Promise.all([ops.lstatBigint(path), ops.realpath(path), handle.fstatBigint()]);
  // prettier-ignore
  const changed = !same(before, after) || !same(before, descriptor) || real !== path || current.length !== prior.length || current.some((entry, index) => entry !== prior[index]);
  if (changed) throw new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
}

function classifyFault(prior: unknown, current: unknown, observed: boolean): unknown {
  if (prior instanceof CorpusFault && prior.code === 'MIGRATION_CORPUS_CLEANUP_FAILED')
    return prior;
  if (current instanceof CorpusFault && current.code === 'MIGRATION_CORPUS_CLEANUP_FAILED')
    return current;
  if (observed) return new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
  if (current instanceof CorpusFault) return current;
  return new CorpusFault('MIGRATION_CORPUS_ROOT_REJECTED');
}

export async function withCorpusDirectories<T>(
  root: string,
  ops: Readonly<CorpusFsOps>,
  task: (context: CorpusDirectories) => Promise<T>
): Promise<T> {
  if (![ops.noFollowFlag, ops.directoryFlag].every(flag => Number.isFinite(flag) && flag !== 0))
    throw new CorpusFault('MIGRATION_CORPUS_PLATFORM_UNSUPPORTED');
  const lexicalRoot = resolve(root);
  const metaPath = corpusChild(lexicalRoot, 'meta');
  if (!metaPath) throw new CorpusFault('MIGRATION_CORPUS_ROOT_REJECTED');
  const opened: Opened[] = [];
  let value: T | undefined, fault: unknown;
  let observed = false;
  try {
    const rootDir = await openDirectory(lexicalRoot, '.', ops, opened);
    const metaDir = await openDirectory(metaPath, 'meta', ops, opened);
    const rootBefore = await snapshot(lexicalRoot, 98, ops);
    const metaBefore = await snapshot(metaPath, 128, ops);
    if (metaBefore.some(entry => !entry.endsWith(':file')))
      throw new CorpusFault('MIGRATION_CORPUS_ROOT_REJECTED');
    observed = true;
    await stage(ops, '.', 'after_read');
    await stage(ops, 'meta', 'after_read');
    try {
      value = await task(
        Object.freeze({
          realRoot: lexicalRoot,
          metaPath,
          rootIdentity: rootDir.before,
          rootSnapshot: rootBefore,
        })
      );
    } catch (error) {
      fault = error;
    }
    await postcheck(lexicalRoot, '.', rootBefore, rootDir.before, rootDir.handle, 98, ops);
    await postcheck(metaPath, 'meta', metaBefore, metaDir.before, metaDir.handle, 128, ops);
  } catch (error) {
    fault = classifyFault(fault, error, observed);
  } finally {
    if (await closeAll(opened, ops)) fault = new CorpusFault('MIGRATION_CORPUS_CLEANUP_FAILED');
  }
  if (fault) throw fault;
  return value as T;
}
