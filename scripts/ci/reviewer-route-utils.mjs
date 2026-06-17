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

export function timeoutConfig(routeName, preset = 'default') {
  if (preset === 'test-no-output') return { firstOutputTimeoutMs: 50, totalTimeoutMs: 400 };
  if (preset === 'test-total') return { firstOutputTimeoutMs: 400, totalTimeoutMs: 80 };
  let totalTimeoutMs = 10 * 60_000;
  if (routeName === 'opus' || routeName === 'codex-senior-reviewer') {
    totalTimeoutMs = 15 * 60_000;
  }
  return { firstOutputTimeoutMs: 300_000, totalTimeoutMs };
}

export function statusForClose(blockerReason, code) {
  if (blockerReason) return 'blocked';
  if (code === 0) return 'ran';
  return 'failed';
}
