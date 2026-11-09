import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const read = file => yaml.load(fs.readFileSync(file, 'utf8'));
const ripgrep = read('.github/actions/setup/action.yml').runs.steps.find(
  step => step.name === 'Ensure ripgrep'
);
const secretScan = read('.github/workflows/secret-scan.yml');
const gitleaks = secretScan.jobs.gitleaks.steps.find(step => step.name === 'Install gitleaks CLI');
const pins = [
  [
    'Linux',
    'x86_64',
    'linux_x64',
    '321137328',
    '79a3ab579b53f71efd634f3aaf7e04a0fa0cf206b7ed434638d1547a2470a66e',
  ],
  [
    'Linux',
    'aarch64',
    'linux_arm64',
    '321137500',
    'b4cbbb6ddf7d1b2a603088cd03a4e3f7ce48ee7fd449b51f7de6ee2906f5fa2f',
  ],
  [
    'Linux',
    'arm64',
    'linux_arm64',
    '321137500',
    'b4cbbb6ddf7d1b2a603088cd03a4e3f7ce48ee7fd449b51f7de6ee2906f5fa2f',
  ],
  [
    'Darwin',
    'x86_64',
    'darwin_x64',
    '321137635',
    'ca221d012d247080c2f6f61f4b7a83bffa2453806b0c195c795bbe9a8c775ed5',
  ],
  [
    'Darwin',
    'arm64',
    'darwin_arm64',
    '321137755',
    'b251ab2bcd4cd8ba9e56ff37698c033ebf38582b477d21ebd86586d927cf87e7',
  ],
];

test('gitleaks pins match the exact official checksums-file bytes and published digest', () => {
  // Official gitleaks_8.30.0_checksums.txt; its SHA-256 equals the release asset digest.
  const checksums = fs.readFileSync('scripts/ci/fixtures/gitleaks-8.30.0-checksums.txt');
  assert.equal(checksums.length, 1099);
  assert.equal(
    createHash('sha256').update(checksums).digest('hex'),
    '78e53de2429bde6500a6f22793546babe6ae75634a0c250c37e3a07703856a90'
  );
  for (const [, , suffix, , digest] of pins) {
    assert.ok(
      checksums.toString().split('\n').includes(`${digest}  gitleaks_8.30.0_${suffix}.tar.gz`)
    );
  }
});

test('both release downloads authenticate REST asset requests with the job token', () => {
  for (const step of [ripgrep, gitleaks]) {
    assert.equal(step.env?.GH_TOKEN, '${{ github.token }}');
    assert.match(step.run, /--header "Authorization: Bearer \$\{GH_TOKEN:\?\}"/u);
    assert.match(step.run, /--header 'Accept: application\/octet-stream'/u);
    assert.match(step.run, /https:\/\/api\.github\.com\/repos\/.+\/releases\/assets\//u);
    assert.doesNotMatch(
      step.run,
      /https:\/\/github\.com\/.*\/releases\/download|set -x|--verbose|--location-trusted/u
    );
    assert.match(
      step.run,
      /--connect-timeout 10[\s\S]*--max-time 120[\s\S]*--retry 2[\s\S]*--retry-max-time 150[\s\S]*--max-filesize/u
    );
    assert.ok(step.run.indexOf('--check') < step.run.indexOf('tar '));
  }
  assert.match(
    ripgrep.run,
    /RIPGREP_SHA256='33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c'/u
  );
  assert.match(ripgrep.run, /releases\/assets\/478120097/u);
  assert.match(ripgrep.run, /sha256sum --check --strict -/u);
  assert.deepEqual(secretScan.jobs.gitleaks.permissions, {
    contents: 'read',
    'pull-requests': 'read',
  });
});

test('every supported gitleaks platform selects its official v8.30.0 archive, asset and digest', () => {
  // Stop before any filesystem or network effects; execute the actual platform case.
  const prefix = gitleaks.run.slice(0, gitleaks.run.indexOf('esac') + 4);
  assert.ok(prefix.includes('case '));
  for (const [platform, arch, suffix, assetId, sha256] of pins) {
    const script = `uname() { if [[ "$1" == '-s' ]]; then echo '${platform}'; else echo '${arch}'; fi; }\n${prefix}\nprintf '%s\\n' "$archive" "$asset_id" "$sha256"`;
    const result = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split('\n'), [
      `gitleaks_8.30.0_${suffix}.tar.gz`,
      assetId,
      sha256,
    ]);
  }
  assert.match(gitleaks.run, /sha256sum --check --strict -/u);
  assert.match(gitleaks.run, /shasum -a 256 --check -/u);
});

test('gitleaks rejects corrupted archives before extraction on every supported platform', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-download-contract-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const bin = path.join(temp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'curl'),
    '#!/bin/bash\nwhile (($#)); do if [[ "$1" == --output ]]; then printf corrupt > "$2"; exit; fi; shift; done\nexit 1\n',
    { mode: 0o755 }
  );
  fs.writeFileSync(path.join(bin, 'tar'), '#!/bin/bash\necho EXTRACTION_REACHED >&2\nexit 99\n', {
    mode: 0o755,
  });
  for (const [platform, arch] of pins) {
    const checksumFallback =
      platform === 'Darwin'
        ? 'command() { if [[ "$*" == "-v sha256sum" ]]; then return 1; else builtin command "$@"; fi; }\n'
        : '';
    const script = `${checksumFallback}uname() { if [[ "$1" == '-s' ]]; then echo '${platform}'; else echo '${arch}'; fi; }\n${gitleaks.run}`;
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RUNNER_TEMP: temp,
        GH_TOKEN: 'fixture-token',
      },
    });
    assert.notEqual(result.status, 0, `${platform}-${arch} accepted corrupt bytes`);
    assert.match(result.stderr, /checksum.*(?:match|FAILED)|FAILED.*checksum/iu);
    assert.doesNotMatch(result.stdout + result.stderr, /EXTRACTION_REACHED|fixture-token/u);
  }
});
