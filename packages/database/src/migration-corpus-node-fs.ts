import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';

import type {
  CorpusDirectoryStream,
  CorpusEntryKind,
  CorpusFsOps,
  CorpusStat,
} from './migration-corpus-contracts';

function kind(value: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): CorpusEntryKind {
  if (value.isSymbolicLink()) return 'symlink';
  if (value.isFile()) return 'file';
  if (value.isDirectory()) return 'directory';
  return 'other';
}

function stat(value: Awaited<ReturnType<typeof lstat>>): CorpusStat {
  const big = value as unknown as {
    dev: bigint;
    ino: bigint;
    nlink: bigint;
    size: bigint;
    mtimeNs: bigint;
    ctimeNs: bigint;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  };
  return Object.freeze({
    dev: big.dev,
    ino: big.ino,
    nlink: big.nlink,
    size: big.size,
    mtimeNs: big.mtimeNs,
    ctimeNs: big.ctimeNs,
    kind: kind(big),
  });
}

async function directoryStream(path: string): Promise<CorpusDirectoryStream> {
  const dir = await opendir(path);
  let closed = false;
  return {
    async *[Symbol.asyncIterator]() {
      while (!closed) {
        const entry = await dir.read();
        if (!entry) return;
        yield Object.freeze({ name: entry.name, kind: kind(entry) });
      }
    },
    async close() {
      if (!closed) {
        await dir.close();
        closed = true;
      }
    },
  };
}

const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0;
const directory = typeof constants.O_DIRECTORY === 'number' ? constants.O_DIRECTORY : 0;

const nodeFsOps: CorpusFsOps = {
  noFollowFlag: noFollow,
  directoryFlag: directory,
  async lstatBigint(path) {
    return stat(await lstat(path, { bigint: true }));
  },
  realpath,
  async openFile(path) {
    const handle = await open(path, constants.O_RDONLY | noFollow);
    return {
      async fstatBigint() {
        return stat((await handle.stat({ bigint: true })) as never);
      },
      async read(target, offset, length, position) {
        return (await handle.read(target, offset, length, position)).bytesRead;
      },
      async close() {
        await handle.close();
      },
    };
  },
  async openDirectory(path) {
    const handle = await open(path, constants.O_RDONLY | noFollow | directory);
    return {
      async fstatBigint() {
        return stat((await handle.stat({ bigint: true })) as never);
      },
      async close() {
        await handle.close();
      },
    };
  },
  streamDirectory: directoryStream,
};
export const NODE_FS_OPS: Readonly<CorpusFsOps> = Object.freeze(nodeFsOps);
