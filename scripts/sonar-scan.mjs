import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { buildNativeScannerArgs } from './sonar-scan-lib.mjs';

async function waitForSonarUp({ statusUrl, timeoutMs }) {
  const start = Date.now();
  // Basic backoff: short sleeps, but don't hammer the server.
  const sleepMs = 1500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(statusUrl, {
        // SonarQube can be slow to respond while booting.
        signal: AbortSignal.timeout(2500),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        const status = data?.status;
        if (status === 'UP') {
          return;
        }
      }
    } catch {
      // ignore and retry
    }

    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }
}

function run(cmd, args, opts = {}) {
  const { allowFailure = false, ...spawnOptions } = opts;
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    ...spawnOptions,
  });

  if (result.error) {
    // Common case: command not found (docker missing)
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    if (allowFailure) {
      return result.status;
    }
    process.exit(result.status);
  }

  return result.status ?? 0;
}

const sonarToken = process.env.SONAR_TOKEN;
const sonarProjectKey = process.env.SONAR_PROJECT_KEY;
const sonarOrganization = process.env.SONAR_ORGANIZATION;

if (!sonarToken) {
  console.error(
    [
      'Missing SONAR_TOKEN.',
      '',
      'Set it in one of these ways:',
      '  1) Add `SONAR_TOKEN=...` to `.env.local` and run: pnpm sonar:full:dotenv',
      '  2) Export it in your shell: export SONAR_TOKEN=...; pnpm sonar:scan',
    ].join('\n')
  );
  process.exit(2);
}

// Run the scanner via Docker so we don't require a global `sonar-scanner` or Java.
// IMPORTANT: do NOT pass `-Dsonar.token=...` because SonarScanner logs the value.
// We pass auth only through the `SONAR_TOKEN` env var.
//
// When running inside a container, `localhost` points to the container itself.
// For local development, the SonarQube server is running on the host (Docker Desktop),
// so we default to `host.docker.internal`.
const cwd = process.cwd();

const sonarHostUrl = process.env.SONAR_HOST_URL ?? 'http://host.docker.internal:9000';
const scannerProperties = [`-Dsonar.host.url=${sonarHostUrl}`];

if (sonarProjectKey) {
  scannerProperties.push(`-Dsonar.projectKey=${sonarProjectKey}`);
}

const isSonarCloud = sonarHostUrl.includes('sonarcloud.io');
if (isSonarCloud) {
  if (!sonarOrganization) {
    console.error(
      [
        'Missing SONAR_ORGANIZATION for SonarCloud scan.',
        '',
        'Set SONAR_ORGANIZATION (example: human) in your environment.',
      ].join('\n')
    );
    process.exit(2);
  }
  scannerProperties.push(`-Dsonar.organization=${sonarOrganization}`);
}

// If we are targeting the default local SonarQube, wait briefly for it to be ready.
// This avoids the common “Failed to query server version” error when SonarQube is still booting.
if (sonarHostUrl.includes('host.docker.internal:9000')) {
  await waitForSonarUp({
    statusUrl: 'http://localhost:9000/api/system/status',
    timeoutMs: 120_000,
  });
}

const forceDocker = process.env.SONAR_SCANNER_FORCE_DOCKER === 'true';
const shouldUseNativeArmScanner =
  !forceDocker && process.platform === 'darwin' && process.arch === 'arm64';

if (shouldUseNativeArmScanner) {
  try {
    const nativeArgs = buildNativeScannerArgs(scannerProperties);
    const nativeStatus = run('pnpm', nativeArgs, { allowFailure: true });
    if (nativeStatus === 0) {
      process.exit(0);
    }
    console.error(
      `Native Sonar scanner failed with status ${nativeStatus}. Falling back to Docker scanner.`
    );
  } catch (error) {
    console.error('Native Sonar scanner invocation failed. Falling back to Docker scanner.');
    console.error(String(error));
  }
}

const dockerPlatform = process.env.SONAR_DOCKER_PLATFORM?.trim() ?? '';
const scannerImage =
  process.env.SONAR_SCANNER_IMAGE?.trim() || 'sonarsource/sonar-scanner-cli:11.5';

const dockerArgs = ['run', '--rm'];

if (dockerPlatform) {
  dockerArgs.push('--platform', dockerPlatform);
}

// On Linux hosts, `host.docker.internal` may require an explicit mapping.
if (process.platform === 'linux') {
  dockerArgs.push('--add-host', 'host.docker.internal:host-gateway');
}

dockerArgs.push(
  '-e',
  'SONAR_TOKEN',
  '-v',
  `${cwd}:/usr/src`,
  '-w',
  '/usr/src',
  scannerImage,
  'sonar-scanner',
  ...scannerProperties
);

try {
  run('docker', dockerArgs);
} catch (error) {
  console.error('Failed to run sonar scan via Docker.');
  console.error('Make sure Docker Desktop is installed and running.');
  console.error(String(error));
  process.exit(1);
}
