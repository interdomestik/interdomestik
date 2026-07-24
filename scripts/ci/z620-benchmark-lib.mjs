import fs from 'node:fs';

export function availableMemoryGiB(meminfo = fs.readFileSync('/proc/meminfo', 'utf8')) {
  const availableKiB = Number(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0);
  return availableKiB / 1024 ** 2;
}

export function turboCacheSummary(output) {
  const plain = String(output).replace(/\u001b\[[0-9;]*m/g, '');
  return (
    plain
      .split('\n')
      .find(line => line.includes('Cached:'))
      ?.trim() || 'not-reported'
  );
}

export function hasFullWarmHit(summary) {
  return /Cached:\s+2 cached,\s+2 total/.test(summary);
}
