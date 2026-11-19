// Every command the verifier runs (git, ps, pnpm, docker, ioreg, sw_vers, ls) gets the lane's own
// environment, unchanged, so it sees exactly the setup the lane uses (pnpm and npm settings in any
// letter case, Docker connection and TLS settings, counted git configuration).
//
// Node's NODE_DEBUG diagnostics (child_process, or a pattern that matches it) print the full
// environment of every command started, credentials included. While NODE_DEBUG is set the
// verifier starts no command at all; the CLI labels such a run a pre-check before reaching one.
import { execFileSync } from 'node:child_process';

/** True when Node may print the environment of each command the verifier would start. */
export function childTraceEnabled(env = process.env) {
  return (env.NODE_DEBUG ?? '').trim() !== '';
}

export function runCommand(command, args, cwd) {
  if (childTraceEnabled()) throw new Error('NODE_DEBUG is set; the verifier starts no command');
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    // The index listing grows with the repository (about 0.5 MB today).
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}
