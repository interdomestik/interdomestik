#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';

export const LOCAL_TEST_HOSTS = [
  '127.0.0.1.nip.io',
  'app.127.0.0.1.nip.io',
  'ida.127.0.0.1.nip.io',
  'ks.127.0.0.1.nip.io',
  'mk.127.0.0.1.nip.io',
  'al.127.0.0.1.nip.io',
  'pilot.127.0.0.1.nip.io',
];

function isLoopbackAddress(address) {
  return ['127.0.0.1', '::1'].includes(address);
}

function activeHostRecords(hostsFileText, hosts = LOCAL_TEST_HOSTS) {
  const wanted = new Set(hosts);
  const records = new Map(hosts.map(host => [host, { loopback: false, nonLoopback: [] }]));
  for (const rawLine of String(hostsFileText).split('\n')) {
    const [address, ...names] = rawLine.replace(/#.*/u, '').trim().split(/\s+/u).filter(Boolean);
    if (!address) continue;
    for (const name of names) {
      if (!wanted.has(name)) continue;
      const record = records.get(name);
      if (isLoopbackAddress(address)) {
        record.loopback = true;
      } else {
        record.nonLoopback.push(address);
      }
    }
  }
  return records;
}

export function missingHosts(hostsFileText, hosts = LOCAL_TEST_HOSTS) {
  const records = activeHostRecords(hostsFileText, hosts);
  return hosts.filter(host => !records.get(host)?.loopback);
}

export function nonLoopbackHosts(hostsFileText, hosts = LOCAL_TEST_HOSTS) {
  const records = activeHostRecords(hostsFileText, hosts);
  return hosts.filter(host => records.get(host)?.nonLoopback.length > 0);
}

export function buildHostsEntry(hosts) {
  return [
    '',
    '# interdomestik deterministic local E2E hosts',
    `127.0.0.1 ${hosts.join(' ')}`,
    '',
  ].join('\n');
}

function appendWithSudo(hostsPath, entry) {
  const result = spawnSync('/usr/bin/sudo', ['-n', '/usr/bin/tee', '-a', hostsPath], {
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    input: entry,
    stdio: ['pipe', 'ignore', 'pipe'],
    encoding: 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || 'sudo tee failed').trim());
  }
}

function appendHostsEntry(hostsPath, entry) {
  try {
    fs.appendFileSync(hostsPath, entry, { encoding: 'utf8' });
  } catch (error) {
    if (error?.code !== 'EACCES' && error?.code !== 'EPERM') throw error;
    appendWithSudo(hostsPath, entry);
  }
}

async function unresolvedLoopbackHosts(hosts) {
  const checks = await Promise.all(
    hosts.map(async host => {
      try {
        const records = await dns.lookup(host, { all: true });
        const hasLoopback = records.some(record =>
          ['127.0.0.1', '::1'].includes(record.address)
        );
        return hasLoopback ? null : host;
      } catch {
        return host;
      }
    })
  );
  return checks.filter(Boolean);
}

export async function ensureLocalTestHosts(options = {}) {
  const hostsPath = options.hostsPath || '/etc/hosts';
  const required = options.required ?? process.env.CI === 'true';
  const hosts = options.hosts || LOCAL_TEST_HOSTS;
  const prefix = '[local-test-hosts]';

  try {
    const existing = fs.readFileSync(hostsPath, 'utf8');
    const conflicts = nonLoopbackHosts(existing, hosts);
    if (required && conflicts.length > 0) {
      throw new Error(`hosts mapped to non-loopback addresses: ${conflicts.join(', ')}`);
    }

    const missing = missingHosts(existing, hosts);
    if (missing.length === 0) {
      console.log(`${prefix} ok`);
      return { ok: true, changed: false, missing: [] };
    }

    const hostsToAdd = required ? missing : await unresolvedLoopbackHosts(missing);
    if (hostsToAdd.length === 0) {
      console.log(`${prefix} dns ok`);
      return { ok: true, changed: false, missing: [] };
    }

    appendHostsEntry(hostsPath, buildHostsEntry(hostsToAdd));
    const updated = fs.readFileSync(hostsPath, 'utf8');
    const stillMissing = missingHosts(updated, hostsToAdd);
    if (stillMissing.length > 0) {
      throw new Error(`hosts still missing: ${stillMissing.join(', ')}`);
    }

    console.log(`${prefix} added ${hostsToAdd.join(', ')}`);
    return { ok: true, changed: true, missing: [] };
  } catch (error) {
    if (required) throw error;
    console.warn(`${prefix} skipped: ${error.message}`);
    return { ok: false, changed: false, missing: hosts };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await ensureLocalTestHosts({
    required: process.env.CI === 'true' || process.argv.includes('--required'),
  });
}
