// Test-only command doubles. No production environment variable selects an executable.
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { basename } = require('node:path');
const { realpathSync } = require('node:fs');
const wrapper = basename(process.argv[1] ?? '');
if (['database-command.mjs', 'dev-clean.mjs'].includes(wrapper)) {
  const controls = [
    'npm_config_script_shell',
    'PNPM_CONFIG_SCRIPT_SHELL',
    'NODE_OPTIONS',
    'NODE_PATH',
    'BASH_ENV',
    'ENV',
    'LD_PRELOAD',
    'DYLD_INSERT_LIBRARIES',
    'COREPACK_NPM_REGISTRY',
    'GIT_SSH_COMMAND',
  ];
  const hostile = process.env.PACKAGE_COMMAND_TEST_HOSTILE === '1';
  if (hostile) for (const key of controls) process.env[key] = 'forbidden-test-control';
  const original = cp.spawnSync;
  cp.spawnSync = (file, args, options) => {
    const name = basename(file).includes('lsof') ? 'LSOF' : 'PNPM';
    if (process.env.PACKAGE_COMMAND_TEST_STICKY === '1') {
      if (options.env.PATH.split(':').includes(realpathSync('/tmp')))
        throw new Error('sticky search directory inherited');
      if (
        !options.env.PATH.split(':').includes(realpathSync(process.env.PACKAGE_COMMAND_TEST_SAFE))
      )
        throw new Error('safe owned descendant excluded');
      process.stdout.write(`PACKAGE_COMMAND_PATH ${name}\n`);
    }
    if (hostile) {
      if (controls.some(key => Object.hasOwn(options.env, key)))
        throw new Error('inherited execution control');
      for (const key of [
        'DATABASE_URL',
        'DATABASE_URL_RLS',
        'BETTER_AUTH_SECRET',
        'BILLING_TEST_MODE',
      ]) {
        if (options.env[key] !== process.env[key])
          throw new Error('missing application environment');
      }
      process.stdout.write(`PACKAGE_COMMAND_ENV ${name}\n`);
    }
    if (args.length === 1 && args[0] === '--version') return original(file, args, options);
    if (process.env[`PACKAGE_COMMAND_FIXTURE_${name}`] !== '1') {
      return { status: null, error: { code: 'ENOENT' } };
    }
    process.stdout.write(`PACKAGE_COMMAND_CAPTURE ${JSON.stringify({ name, args })}\n`);
    const prefix = name === 'LSOF' ? 'FAKE_LSOF' : 'FAKE_COMMAND';
    return {
      status: Number(process.env[`${prefix}_EXIT`] ?? 0),
      stdout: process.env[`${prefix}_STDOUT`] ?? '',
      stderr: process.env[`${prefix}_STDERR`] ?? '',
    };
  };
  syncBuiltinESMExports();
}
