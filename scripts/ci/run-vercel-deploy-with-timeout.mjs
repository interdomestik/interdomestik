#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TIMEOUT = 900;
const SAFE_SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const options = separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const vercelArgs = separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
  let timeout = DEFAULT_TIMEOUT;

  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--timeout-seconds') {
      timeout = Number.parseInt(options[index + 1] || '', 10);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${option}`);
  }

  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('--timeout-seconds must be a positive integer');
  }
  if (vercelArgs[0] !== 'deploy') {
    throw new Error('Vercel deploy arguments must be provided after --');
  }

  return { timeout, vercelArgs };
}

function appendTail(current, chunk, maxChars = 12_000) {
  const next = current + chunk;
  return next.length > maxChars ? next.slice(-maxChars) : next;
}

function compactTail(value, maxLines = 80) {
  return value.split(/\r?\n/u).filter(Boolean).slice(-maxLines).join('\n');
}

function resolveNpxCliPath() {
  const npmCliPath = path.resolve(
    path.dirname(process.execPath),
    '..',
    'lib',
    'node_modules',
    'npm',
    'bin',
    'npx-cli.js'
  );
  if (!fs.existsSync(npmCliPath)) {
    throw new Error(`Unable to locate npm npx CLI at ${npmCliPath}`);
  }
  return npmCliPath;
}

async function main() {
  const { timeout, vercelArgs } = parseArgs(process.argv.slice(2));
  let stdoutTail = '';
  let stderrTail = '';
  let timedOut = false;

  const child = spawn(
    process.execPath,
    [resolveNpxCliPath(), '--yes', 'vercel@latest', ...vercelArgs],
    {
      detached: process.platform !== 'win32',
      env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${SAFE_SYSTEM_PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const timer = setTimeout(() => {
    timedOut = true;
    const pid = child.pid;
    if (!pid) return;
    const killTarget = process.platform === 'win32' ? pid : -pid;
    try {
      process.kill(killTarget, 'SIGTERM');
    } catch {}
    setTimeout(() => {
      try {
        process.kill(killTarget, 'SIGKILL');
      } catch {}
    }, 2_000).unref();
  }, timeout * 1000);

  child.stdout.on('data', chunk => {
    stdoutTail = appendTail(stdoutTail, chunk.toString());
  });
  child.stderr.on('data', chunk => {
    const text = chunk.toString();
    stderrTail = appendTail(stderrTail, text);
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });
  clearTimeout(timer);

  if (timedOut) {
    console.error(`::error::Vercel deploy timed out after ${timeout}s`);
    const outputTail = compactTail(`${stdoutTail}\n${stderrTail}`);
    if (outputTail) console.error(outputTail);
    process.exit(124);
  }

  if (exitCode !== 0) {
    console.error(`::error::Vercel deploy failed with exit code ${exitCode}`);
    const outputTail = compactTail(`${stdoutTail}\n${stderrTail}`);
    if (outputTail) console.error(outputTail);
    process.exit(exitCode);
  }

  const lastStdoutLine = stdoutTail.split(/\r?\n/u).findLast(Boolean);
  if (!lastStdoutLine) {
    console.error('::error::Vercel deploy produced no deployment URL');
    process.exit(1);
  }
  console.log(lastStdoutLine);
}

try {
  await main();
} catch (error) {
  console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
