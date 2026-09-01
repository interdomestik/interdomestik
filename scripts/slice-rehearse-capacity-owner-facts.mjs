import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { CAPACITY_CATEGORIES } from './repo-size-capacity-schema.mjs';
import { collectTrackedStats, getTrackedFiles } from './repo-size-inventory.mjs';
import { compareText, sha256 } from './slice-rehearse-canonical.mjs';

const MAX_WRITER_BYTES = 16 * 1024 * 1024;

export function projectionCapacityOwnerPaths(budget, { topology }) {
  if (!['projection-only', 'promotion'].includes(topology?.closeoutMode)) return [];
  const paths = new Set(topology.projectionPaths);
  return [
    ...new Set(
      budget.allocations
        .filter(allocation => allocation.writerPaths.some(filePath => paths.has(filePath)))
        .flatMap(allocation => allocation.writerPaths)
    ),
  ].sort(compareText);
}

export function collectTrackedFacts(repository, { gitBin, env }) {
  const trackedFiles = getTrackedFiles(repository, { includeUntracked: false }, { gitBin, env });
  for (const filePath of trackedFiles) {
    const facts = lstatSync(path.join(repository, filePath), { throwIfNoEntry: false });
    if (!facts?.isFile()) throw new Error(`Tracked path is not a regular file: ${filePath}`);
  }
  const stats = collectTrackedStats(repository, trackedFiles, { minLines: 0, top: 0 });
  if (stats.missingFiles.length > 0) {
    throw new Error(`Tracked repository evidence is unavailable: ${stats.missingFiles.join(', ')}`);
  }
  const categoryBytes = Object.fromEntries(CAPACITY_CATEGORIES.map(category => [category, 0]));
  for (const category of stats.categories) categoryBytes[category.name] = category.bytes;
  return { files: stats.total.files, bytes: stats.total.bytes, categoryBytes };
}

function readWriter(repository, filePath) {
  if (filePath.startsWith(':')) throw new Error(`Writer path uses Git pathspec magic: ${filePath}`);
  const absolute = path.resolve(repository, filePath);
  if (!absolute.startsWith(`${repository}${path.sep}`)) throw new Error('Unsafe writer path.');
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)
    );
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) throw new Error(`Writer path is not a regular file: ${filePath}`);
    if (before.size > BigInt(MAX_WRITER_BYTES)) {
      throw new Error(`Writer path exceeds read bound: ${filePath}`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      BigInt(bytes.byteLength) !== before.size ||
      after.size !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs
    ) {
      throw new Error(`Writer path changed while collecting facts: ${filePath}`);
    }
    if (bytes.includes(0)) throw new Error(`Writer path is not text: ${filePath}`);
    const text = bytes.toString('utf8');
    return {
      bytes: bytes.byteLength,
      exists: true,
      lines: text.length === 0 ? 0 : text.split('\n').length - Number(text.endsWith('\n')),
      sha256: sha256(bytes),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { bytes: 0, exists: false, lines: 0, sha256: null };
    if (error?.code === 'ELOOP') throw new Error(`Writer path is not a regular file: ${filePath}`);
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function collectWriterFactsAtBase({
  repository,
  baseSha,
  writerPaths,
  gitBytes,
  assertCommit,
}) {
  assertCommit(repository, baseSha);
  return Object.fromEntries(
    writerPaths.map(filePath => {
      const current = readWriter(repository, filePath);
      const baseEntry = gitBytes(repository, [
        'ls-tree',
        '-z',
        '--full-tree',
        baseSha,
        '--',
        filePath,
      ]);
      const baseExists = Buffer.byteLength(baseEntry) > 0;
      if (baseExists && baseEntry.subarray(0, 3).toString('ascii') !== '100') {
        throw new Error(`Manifest-base writer path is not a regular file: ${filePath}`);
      }
      const baseBytes = baseExists
        ? Buffer.byteLength(gitBytes(repository, ['show', `${baseSha}:${filePath}`]))
        : 0;
      return [
        filePath,
        {
          baseBytes,
          baseExists,
          currentBytes: current.bytes,
          currentExists: current.exists,
          currentLines: current.lines,
          currentSha256: current.sha256,
        },
      ];
    })
  );
}

export function capacityOwnerDeltasFromFacts(facts) {
  return Object.fromEntries(
    Object.entries(facts).map(([filePath, value]) => [
      filePath,
      {
        bytes: value.currentBytes - value.baseBytes,
        currentBytes: value.currentBytes,
        currentSha256: value.currentSha256,
        files: Number(value.currentExists) - Number(value.baseExists),
        capacityBaselineExists: value.baseExists,
        currentExists: value.currentExists,
      },
    ])
  );
}
