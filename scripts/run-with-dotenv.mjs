import { spawn } from 'node:child_process';
import process from 'node:process';

import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env.local' });

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/run-with-dotenv.mjs <command> [args...]');
  process.exit(2);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('exit', code => {
  process.exit(code ?? 1);
});
