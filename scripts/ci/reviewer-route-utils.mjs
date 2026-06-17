import fs from 'node:fs';
import path from 'node:path';

export function commandAvailable(command, env) {
  const candidates = command.includes(path.sep)
    ? [command]
    : String(env.PATH || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map(dir => path.join(dir, command));
  return candidates.some(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function safeTimeout(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(parsed, 1), max);
}

export function statusForClose(blockerReason, code) {
  if (blockerReason) return 'blocked';
  if (code === 0) return 'ran';
  return 'failed';
}
