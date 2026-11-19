// A gate run takes its environment from a closed list: the login basics, what pnpm itself adds to
// a lifecycle script, and the documented gate settings. Any other variable (NODE_OPTIONS,
// GIT_TRACE*, PG*, DOTENV_*, an override that one test or helper reads) makes the run a pre-check,
// and the verifier then starts no command, so no tracing variable can print an environment.
// Listing what may change a run never ends; listing what a gate run needs does.
import { GUARDED_ENV_KEYS, ISOLATION_ENV_KEYS } from './verify-machine-env.mjs';

const LOGIN_NAMES = [
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
  'TERM',
  'PWD',
  'OLDPWD',
  'SHLVL',
  '_',
  '__CF_USER_TEXT_ENCODING',
];

// What pnpm 10 adds to a lifecycle script on the marked Mac, from its own and the repository's
// configuration. A newer pnpm that adds a name makes runs pre-checks until this list follows.
const PNPM_NAMES = [
  'COREPACK_ENABLE_DOWNLOAD_PROMPT',
  'COREPACK_ROOT',
  'INIT_CWD',
  'NODE',
  'PNPM_SCRIPT_SRC_DIR',
  'npm_command',
  'npm_execpath',
  'npm_lifecycle_event',
  'npm_lifecycle_script',
  'npm_node_execpath',
  'npm_package_json',
  'npm_package_name',
  // From the committed root package.json, which the clean-tree check covers.
  'npm_package_version',
  'npm_package_engines_node',
  'npm_config_overrides',
  'npm_config_patched_dependencies',
  'pnpm_config_verify_deps_before_run',
  'npm_config__jsr_registry',
  'npm_config_cache',
  'npm_config_engine_strict',
  'npm_config_frozen_lockfile',
  'npm_config_globalconfig',
  'npm_config_node_gyp',
  'npm_config_npm_globalconfig',
  'npm_config_registry',
  'npm_config_reporter',
  'npm_config_store_dir',
  'npm_config_user_agent',
  'npm_config_verify_deps_before_run',
];

const GATE_ENV_NAMES = new Set([
  ...LOGIN_NAMES,
  ...PNPM_NAMES,
  ...GUARDED_ENV_KEYS.filter(key => key !== 'SENTRY_AUTH_TOKEN'),
  ...ISOLATION_ENV_KEYS,
]);

/** Names (never values) of variables a gate run does not take. */
export function unexpectedEnvNames(env) {
  return Object.keys(env)
    .filter(name => !GATE_ENV_NAMES.has(name))
    .sort((a, b) => a.localeCompare(b));
}
