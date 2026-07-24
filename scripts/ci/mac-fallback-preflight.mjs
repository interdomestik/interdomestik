#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import net from 'node:net';

import { DEFAULT_FALLBACK_PORTS, macFallbackDisposition } from './mac-fallback-lib.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/u, '').split('=');
    return [key, value.join('=') || true];
  })
);

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout: 5_000 });
  return {
    status: result.status,
    error: result.error ? String(result.error.message || result.error) : '',
    stderr: String(result.stderr || ''),
  };
}

function probePrimary(host) {
  const results = [1, 2].map(() =>
    capture('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=3',
      '-o',
      'ConnectionAttempts=1',
      host,
      'true',
    ])
  );
  if (results.some(result => result.status === 0)) return false;
  const confirmedDown = results.every(
    result =>
      !result.error &&
      /connection refused|operation timed out|connection timed out|no route to host/iu.test(
        result.stderr
      )
  );
  return confirmedDown ? true : null;
}

function canListen(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () =>
      server.close(() => resolve(true))
    );
  });
}

function gitValue(commandArgs) {
  try {
    return execFileSync('git', commandArgs, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const fallbackPorts = String(args.ports || DEFAULT_FALLBACK_PORTS.join(','))
  .split(',')
  .map(value => Number.parseInt(value, 10));
const z620Unreachable = probePrimary(String(args.host || 'z620'));
const dockerReady = capture('docker', ['info', '--format', '{{.ServerVersion}}']).status === 0;
const sha = gitValue(['rev-parse', 'HEAD']);
const clean = gitValue(['status', '--porcelain']) === '';
const portsValid = fallbackPorts.every(
  port => Number.isInteger(port) && port > 0 && port <= 65_535
);
const fallbackPortsFree =
  portsValid && (await Promise.all(fallbackPorts.map(port => canListen(port)))).every(Boolean);

const result = macFallbackDisposition({
  authorizedBy: args['authorized-by'],
  authorizedAt: args['authorized-at'],
  z620Reachable: z620Unreachable === null ? null : !z620Unreachable,
  dockerReady,
  clean,
  sha,
  platform: process.platform,
  arch: process.arch,
  fallbackPorts,
  fallbackPortsFree,
});

console.log(
  JSON.stringify(
    {
      ...result,
      sha,
      host: String(args.host || 'z620'),
      fallbackPorts,
      checks: {
        primaryConfirmedUnreachable: z620Unreachable === true,
        dockerReady,
        clean,
        fallbackPortsFree,
      },
    },
    null,
    2
  )
);
process.exitCode = result.status === 'allowed' ? 0 : 1;
