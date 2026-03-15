import { spawn } from 'node:child_process';
import process from 'node:process';

try {
  const { config: dotenvConfig } = await import('dotenv');
  dotenvConfig({ path: '.env.local' });
} catch (error) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ERR_MODULE_NOT_FOUND' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.includes("'dotenv'")
  ) {
    // Allow command wrappers to run in isolated worktrees without a local install.
  } else {
    throw error;
  }
}

// Guard against empty host entries in .env.local (e.g. KS_HOST=)
// which can poison Playwright base URLs (http:///sq, http:///mk).
for (const key of ['KS_HOST', 'MK_HOST', 'AL_HOST', 'PILOT_HOST']) {
  const value = process.env[key];
  if (typeof value === 'string' && value.trim() === '') {
    delete process.env[key];
  }
}

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
