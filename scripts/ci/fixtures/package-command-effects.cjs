// Test-only command doubles. No production environment variable selects an executable.
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const { basename } = require('node:path');
const wrapper = basename(process.argv[1] ?? '');
if (['database-command.mjs', 'dev-clean.mjs'].includes(wrapper)) {
  const original = cp.spawnSync;
  cp.spawnSync = (file, args, options) => {
    if (args.length === 1 && args[0] === '--version') return original(file, args, options);
    const name = basename(file).includes('lsof') ? 'LSOF' : 'PNPM';
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
