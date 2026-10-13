import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const OMIT = Symbol('omit');

function writeAll(descriptor, text) {
  const bytes = Buffer.from(text);
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
      throw new Error('Guard report write made no valid progress');
    }
    offset += written;
  }
}

function normalized(value, key, arrayItem) {
  let candidate = value;
  if (candidate && typeof candidate === 'object' && typeof candidate.toJSON === 'function') {
    candidate = candidate.toJSON(key);
  }
  if (candidate === undefined || typeof candidate === 'function' || typeof candidate === 'symbol') {
    return arrayItem ? null : OMIT;
  }
  if (typeof candidate === 'bigint') JSON.stringify(candidate);
  return candidate;
}

function writeJsonArray(descriptor, value, depth, ancestors) {
  writeAll(descriptor, '[');
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) writeAll(descriptor, ',');
    writeAll(descriptor, `\n${'  '.repeat(depth + 1)}`);
    writeJsonValue(descriptor, normalized(value[index], String(index), true), depth + 1, ancestors);
  }
  if (value.length > 0) writeAll(descriptor, `\n${'  '.repeat(depth)}`);
  writeAll(descriptor, ']');
}

function writeJsonObject(descriptor, value, depth, ancestors) {
  writeAll(descriptor, '{');
  let count = 0;
  for (const key of Object.keys(value)) {
    const child = normalized(value[key], key, false);
    if (child === OMIT) continue;
    if (count > 0) writeAll(descriptor, ',');
    writeAll(descriptor, `\n${'  '.repeat(depth + 1)}${JSON.stringify(key)}: `);
    writeJsonValue(descriptor, child, depth + 1, ancestors);
    count += 1;
  }
  if (count > 0) writeAll(descriptor, `\n${'  '.repeat(depth)}`);
  writeAll(descriptor, '}');
}

function writeJsonValue(descriptor, value, depth, ancestors) {
  if (value === null || typeof value !== 'object') {
    writeAll(descriptor, JSON.stringify(value));
    return;
  }
  if (ancestors.has(value)) throw new TypeError('Converting circular structure to JSON');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) writeJsonArray(descriptor, value, depth, ancestors);
    else writeJsonObject(descriptor, value, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function writeJsonAtomically(output, report) {
  const temporary = `${output}.tmp-${process.pid}-${randomUUID()}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx');
    const value = normalized(report, '', false);
    if (value === OMIT) throw new TypeError('Guard report is not JSON serializable');
    writeJsonValue(descriptor, value, 0, new Set());
    writeAll(descriptor, '\n');
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, output);
  } catch (error) {
    try {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    } catch {
      // Preserve the write failure as the reason for the fail-closed report.
    }
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Preserve the original failure; the fallback report still decides the verdict.
    }
    throw error;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function writeGuardReport(output, report, adoption) {
  try {
    writeJsonAtomically(output, report);
    return report;
  } catch (error) {
    const incomplete = {
      status: 'incomplete',
      trustedCommit: adoption.commit,
      trustedTree: adoption.tree,
      incomplete: [{ reason: `incomplete: report serialization failed: ${errorMessage(error)}` }],
      failingNewEntries: [],
    };
    try {
      writeJsonAtomically(output, incomplete);
      return incomplete;
    } catch (fallbackError) {
      throw new Error(
        `incomplete: report write failed: ${errorMessage(error)}; fallback failed: ${errorMessage(fallbackError)}`
      );
    }
  }
}
