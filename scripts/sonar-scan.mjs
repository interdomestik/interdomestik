import { spawnSync } from 'node:child_process';
import process from 'node:process';

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
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    ...opts,
  });

  if (result.error) {
    // Common case: command not found (docker missing)
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

const sonarToken = process.env.SONAR_TOKEN;

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

// If we are targeting the default local SonarQube, wait briefly for it to be ready.
// This avoids the common “Failed to query server version” error when SonarQube is still booting.
if (sonarHostUrl.includes('host.docker.internal:9000')) {
  await waitForSonarUp({
    statusUrl: 'http://localhost:9000/api/system/status',
    timeoutMs: 120_000,
  });
}

// NOTE: sonarsource/sonar-scanner-cli is amd64-only as of today.
// On Apple Silicon (arm64), Docker Desktop will run linux/amd64 images via emulation.
const dockerPlatform = process.arch === 'arm64' ? 'linux/amd64' : 'linux/amd64';

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
  'sonarsource/sonar-scanner-cli:latest',
  'sonar-scanner',
  `-Dsonar.host.url=${sonarHostUrl}`
);

try {
  run('docker', dockerArgs);
} catch (error) {
  console.error('Failed to run sonar scan via Docker.');
  console.error('Make sure Docker Desktop is installed and running.');
  console.error(String(error));
  process.exit(1);
}
