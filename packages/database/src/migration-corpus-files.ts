import {
  CorpusFault,
  type CorpusFsOps,
  type CorpusStat,
  type MigrationCorpusErrorCode,
} from './migration-corpus-contracts';
import { corpusChild, isContained } from './migration-corpus-root';

const MAX_FILE_BYTES = 65_536n;

function same(left: CorpusStat, right: CorpusStat): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.nlink === right.nlink &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs &&
    left.kind === right.kind
  );
}

async function stage(
  ops: Readonly<CorpusFsOps>,
  name: string,
  value: Parameters<NonNullable<CorpusFsOps['onStage']>>[0]
) {
  await ops.onStage?.(value, name);
}

function acceptable(stat: CorpusStat, maximumBytes: bigint): boolean {
  return (
    stat.kind === 'file' &&
    stat.nlink === 1n &&
    stat.size >= 0n &&
    stat.size <= MAX_FILE_BYTES &&
    stat.size <= maximumBytes &&
    stat.size <= BigInt(Number.MAX_SAFE_INTEGER)
  );
}

function classifyFault(
  error: unknown,
  observed: boolean,
  initialCode: MigrationCorpusErrorCode
): CorpusFault {
  if (error instanceof CorpusFault) return error;
  if (observed) return new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
  return new CorpusFault(initialCode);
}

async function closeFile(
  handle: Awaited<ReturnType<CorpusFsOps['openFile']>>,
  relativeName: string,
  ops: Readonly<CorpusFsOps>
): Promise<boolean> {
  let failed = false;
  try {
    await stage(ops, relativeName, 'before_close');
  } catch {
    failed = true;
  }
  try {
    await handle.close();
  } catch {
    failed = true;
  }
  return failed;
}

export async function readCorpusFile(
  parent: string,
  realRoot: string,
  name: string,
  relativeName: string,
  initialCode: MigrationCorpusErrorCode,
  maximumBytes: bigint,
  ops: Readonly<CorpusFsOps>
): Promise<Readonly<{ bytes: Uint8Array; stat: CorpusStat }>> {
  const candidate = corpusChild(parent, name);
  if (!candidate || !isContained(realRoot, candidate)) throw new CorpusFault(initialCode);
  let handle: Awaited<ReturnType<CorpusFsOps['openFile']>> | undefined;
  let observed = false;
  let output: Readonly<{ bytes: Uint8Array; stat: CorpusStat }> | undefined;
  let fault: unknown;
  try {
    await stage(ops, relativeName, 'before_lstat');
    const before = await ops.lstatBigint(candidate);
    if (!acceptable(before, maximumBytes)) throw new CorpusFault(initialCode);
    await stage(ops, relativeName, 'after_lstat');
    if ((await ops.realpath(candidate)) !== candidate) {
      throw new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
    }
    handle = await ops.openFile(candidate);
    await stage(ops, relativeName, 'after_open');
    if (!same(before, await handle.fstatBigint())) {
      throw new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
    }
    observed = true;
    const size = Number(before.size);
    const bytes = new Uint8Array(size);
    if ((await handle.read(bytes, 0, size, 0)) !== size) {
      throw new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
    }
    await stage(ops, relativeName, 'after_read');
    if ((await handle.read(new Uint8Array(1), 0, 1, size)) !== 0) {
      throw new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
    }
    await stage(ops, relativeName, 'before_postcheck');
    const [descriptor, after, resolved] = await Promise.all([
      handle.fstatBigint(),
      ops.lstatBigint(candidate),
      ops.realpath(candidate),
    ]);
    if (!same(before, descriptor) || !same(before, after) || resolved !== candidate) {
      throw new CorpusFault('MIGRATION_CORPUS_CHANGED_DURING_READ');
    }
    output = Object.freeze({ bytes, stat: before });
  } catch (error) {
    fault = classifyFault(error, observed, initialCode);
  } finally {
    if (handle && (await closeFile(handle, relativeName, ops)))
      fault = new CorpusFault('MIGRATION_CORPUS_CLEANUP_FAILED');
  }
  if (fault) throw fault;
  if (!output) throw new CorpusFault(initialCode);
  return output;
}
