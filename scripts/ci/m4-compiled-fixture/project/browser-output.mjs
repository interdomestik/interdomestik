import fs from 'node:fs';
import path from 'node:path';

export function assertOwnedBrowserOutput(output) {
  if (
    typeof output !== 'string' ||
    !path.isAbsolute(output) ||
    typeof process.getuid !== 'function' ||
    fs.realpathSync(output) !== output
  )
    throw Error('Owned browser output directory required');
  const fd = fs.openSync(
    output,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW
  );
  try {
    const stat = fs.fstatSync(fd),
      actual = fs.lstatSync(output);
    if (
      !stat.isDirectory() ||
      !actual.isDirectory() ||
      stat.dev !== actual.dev ||
      stat.ino !== actual.ino ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o7777) !== 0o700
    )
      throw Error('Owned browser output directory required');
  } finally {
    fs.closeSync(fd);
  }
  return output;
}

// Called once by the authenticated parent before Playwright can clean or mutate output.
export function assertFreshBrowserOutput(output) {
  assertOwnedBrowserOutput(output);
  if (fs.readdirSync(output).length) throw Error('Fresh owned browser output required');
  return output;
}

export function browserRowsComplete(rows, denial) {
  if (!Array.isArray(rows) || rows.length !== 3 || !denial) return false;
  const profiles = ['legacy-admin', 'legacy-agent', 'staff', 'legacy-admin'];
  const all = [...rows, denial];
  return (
    all.every(
      (row, index) =>
        row &&
        row.profile === profiles[index] &&
        typeof row.operationId === 'string' &&
        row.operationId.length > 0 &&
        typeof row.frameworkActionId === 'string' &&
        row.frameworkActionId.length > 0
    ) && new Set(all.map(row => row.operationId)).size === 4
  );
}
