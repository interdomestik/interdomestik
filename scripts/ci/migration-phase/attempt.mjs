import { closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { resolveReleasePath } from '../../../packages/database/src/release-migration-path.mts';
import { HEX, matches } from './proof.mjs';

export function reserveAttempt(root, directory, nonce) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || !matches(HEX, nonce))
    throw new Error('ATTEMPT_STORE_REJECTED');
  let fd;
  try {
    const store = resolveReleasePath(root, directory, { noSymlink: true });
    fd = openSync(store, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)
      throw new Error('ATTEMPT_STORE_REJECTED');
    const attempt = join(store, nonce);
    try {
      mkdirSync(attempt, { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('RECEIPT_REPLAYED');
      throw error;
    }
    // The directory entry is the record. Persist it before running any release checks.
    fsyncSync(fd);
    return attempt;
  } catch (error) {
    if (error.message === 'RECEIPT_REPLAYED') throw error;
    throw new Error('ATTEMPT_STORE_REJECTED');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
