// Every command the verifier runs (git, ps, pnpm, docker, ioreg, sw_vers, ls) gets an allowlisted
// environment: the settings it needs to see the lane's setup, never a credential. A diagnostic such
// as NODE_DEBUG=child_process prints the environment each child receives.
import { execFileSync } from 'node:child_process';

// Search path and locale, user and config locations, the container client's selection, git's own
// variables (any of them already downgrades the run) and pnpm's settings.
const PROBE_ENV_NAME =
  /^(?:PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|LANG|LC_[A-Z]+|XDG_[A-Z_]+|DOCKER_(?:HOST|CONTEXT|CONFIG)|GIT_[A-Z_]+|PNPM_HOME|COREPACK_[A-Z_]+|npm_config_[a-z_]+)$/u;
// An allowlisted name can still carry a credential (npm_config__authtoken, GIT_HTTP_*_PASSWORD).
const CREDENTIAL_NAME = /auth|token|passw|secret|key|cert|credential|cookie/iu;

/** The environment for verifier commands. */
export function probeEnvironment(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => PROBE_ENV_NAME.test(name) && !CREDENTIAL_NAME.test(name))
  );
}

export function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    env: probeEnvironment(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    // The index listing grows with the repository (about 0.5 MB today).
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}
