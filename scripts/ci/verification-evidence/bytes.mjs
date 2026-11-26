import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';

// Reject links, pipes and empty files. Read the very descriptor that was checked.
export function readBytes(file, maxBytes = 256 * 1024 * 1024) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size <= 0 || stat.size > maxBytes) {
      throw new Error('artifact-file');
    }
    const bytes = readFileSync(fd);
    if (bytes.length !== stat.size) throw new Error('artifact-length');
    return bytes;
  } finally {
    closeSync(fd);
  }
}
