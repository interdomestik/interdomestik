import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, closeSync, constants, fsyncSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { reserveAttempt } from './attempt.mjs';

const filename = 'sponsor-evidence.jsonl';

export function sponsorEvidence(root, directory, context) {
  const attempt = randomBytes(32).toString('hex');
  const hash = createHash('sha256');
  let location;

  return {
    record(transactionId, event) {
      const line = `${JSON.stringify({ ...context, transactionId, ...event })}\n`;
      try {
        const first = location === undefined;
        location ??= reserveAttempt(root, directory, attempt);
        const flag = constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW;
        appendFileSync(join(location, filename), line, {
          flag: first ? flag | constants.O_CREAT | constants.O_EXCL : flag,
          mode: 0o600,
          flush: true,
        });
        if (first) {
          const fd = openSync(
            location,
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
          );
          try {
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
        }
        hash.update(line);
      } catch (error) {
        throw new Error('SPONSOR_EVIDENCE_STORE_REJECTED', { cause: error });
      }
    },
    reference() {
      return location && { file: `${attempt}/${filename}`, sha256: hash.digest('hex') };
    },
  };
}
