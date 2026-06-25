import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

const [target, maybeProdArg] = process.argv.slice(2);

if (!target || !['preview', 'production'].includes(target)) {
  console.error('Vercel env target must be preview or production.');
  process.exit(2);
}

if (maybeProdArg && (target !== 'production' || maybeProdArg !== '--prod')) {
  console.error('Only production builds may pass --prod.');
  process.exit(2);
}

function parseEnv(contents) {
  const parsed = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const match = /^([A-Za-z_]\w*)=(.*)$/u.exec(line);
    if (!match || line.startsWith('#')) continue;
    let value = match[2].trim();
    const quoted = /^(['"])(.*)\1$/u.exec(value);
    if (quoted) value = quoted[2];
    parsed[match[1]] = value;
  }
  return parsed;
}

function readPulledEnvFile(value) {
  if (value === 'preview') {
    return {
      envPath: '.vercel/.env.preview.local',
      parsed: parseEnv(readFileSync('.vercel/.env.preview.local', 'utf8')),
    };
  }
  return {
    envPath: '.vercel/.env.production.local',
    parsed: parseEnv(readFileSync('.vercel/.env.production.local', 'utf8')),
  };
}

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

let envPath;
let parsed;
try {
  ({ envPath, parsed } = readPulledEnvFile(target));
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error(`Missing Vercel environment file for ${target}.`);
    process.exit(1);
  }
  throw error;
}

let loadedCount = 0;

for (const [key, value] of Object.entries(parsed)) {
  if (!hasValue(process.env[key])) {
    process.env[key] = value;
    if (hasValue(value)) loadedCount += 1;
  }
}

const missingRequired = ['DATABASE_URL', 'DATABASE_URL_RLS'].filter(
  key => !hasValue(process.env[key])
);

if (missingRequired.length > 0) {
  console.error(`Missing required Vercel build env keys: ${missingRequired.join(', ')}`);
  process.exit(1);
}

console.log(`Loaded ${loadedCount} Vercel env keys from ${envPath}.`);

const buildArgs = ['--yes', 'vercel@latest', 'build'];
if (target === 'production') buildArgs.push('--prod');
const npxBin = join(dirname(process.execPath), process.platform === 'win32' ? 'npx.cmd' : 'npx');

const child = spawn(npxBin, buildArgs, {
  stdio: 'inherit',
  shell: false,
});

child.on('exit', code => {
  process.exit(code ?? 1);
});

child.on('error', error => {
  console.error(`Failed to run Vercel build command: ${error.message}`);
  process.exit(1);
});
