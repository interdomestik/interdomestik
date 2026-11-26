import { closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { HEX, matches } from './proof.mjs';

export function reserveAttempt(directory, nonce) {
  if (typeof directory !== 'string' || !isAbsolute(directory) || !matches(HEX, nonce))
    throw new Error('ATTEMPT_STORE_REJECTED');
  let fd;
  try {
    fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)
      throw new Error('ATTEMPT_STORE_REJECTED');
    try {
      mkdirSync(join(directory, nonce), { mode: 0o700 });
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('RECEIPT_REPLAYED');
      throw error;
    }
    // The directory entry is the record. Persist it before running any release checks.
    fsyncSync(fd);
  } catch (error) {
    if (error.message === 'RECEIPT_REPLAYED') throw error;
    throw new Error('ATTEMPT_STORE_REJECTED');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
