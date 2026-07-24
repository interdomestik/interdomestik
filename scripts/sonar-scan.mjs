import process from 'node:process';

import {
  normalizeSonarHostUrl,
  resolveSonarStatusTarget,
  waitForSonarUp,
} from './sonar-scan-lib.mjs';
import {
  appendPullRequestScannerProperties,
  appendScannerProperties,
  appendSonarAnalysisProperties,
  buildDockerScannerArgs,
  buildNativeScannerArgs,
  resolveSonarAnalysisContext,
  runCommand as run,
} from './sonar-scan-runtime.mjs';

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
// Authentication is passed only through `SONAR_TOKEN`, never through process
// arguments, so it cannot appear in process listings or scanner command logs.
const cwd = process.cwd();

const sonarHostUrl = normalizeSonarHostUrl(process.env.SONAR_HOST_URL);
const skipJreProvisioning = process.env.SONAR_SCANNER_SKIP_JRE_PROVISIONING === 'true';
const scannerProperties = appendScannerProperties([`-Dsonar.host.url=${sonarHostUrl}`], {
  skipJreProvisioning,
});

if (sonarProjectKey) {
  scannerProperties.push(`-Dsonar.projectKey=${sonarProjectKey}`);
}

const isSonarCloud = sonarHostUrl === 'https://sonarcloud.io';
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

let analysisContext;
try {
  analysisContext = resolveSonarAnalysisContext();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const scannerPropertiesWithAnalysisContext = appendPullRequestScannerProperties(
  appendSonarAnalysisProperties(scannerProperties, analysisContext),
  analysisContext
);

const forceDocker = process.env.SONAR_SCANNER_FORCE_DOCKER === 'true';
const forceNative = process.env.SONAR_SCANNER_FORCE_NATIVE === 'true';
const shouldUseNativeScanner =
  forceNative || (!forceDocker && process.platform === 'darwin' && process.arch === 'arm64');
const sonarStatusTarget = resolveSonarStatusTarget({ sonarHostUrl, forceNative });

if (sonarStatusTarget) {
  await waitForSonarUp({
    statusTarget: sonarStatusTarget,
    timeoutMs: 120_000,
  });
}

if (shouldUseNativeScanner) {
  try {
    const nativeArgs = buildNativeScannerArgs(scannerPropertiesWithAnalysisContext);
    const nativeStatus = run('pnpm', nativeArgs, { allowFailure: true });
    if (nativeStatus === 0) {
      process.exit(0);
    }
    if (forceNative) {
      process.exit(nativeStatus || 1);
    }
    console.error(
      `Native Sonar scanner failed with status ${nativeStatus}. Falling back to Docker scanner.`
    );
  } catch (error) {
    if (forceNative) {
      console.error('Native Sonar scanner invocation failed.');
      console.error(String(error));
      process.exit(1);
    }
    console.error('Native Sonar scanner invocation failed. Falling back to Docker scanner.');
    console.error(String(error));
  }
}

const dockerPlatform = process.env.SONAR_DOCKER_PLATFORM?.trim() ?? '';
const scannerImage =
  process.env.SONAR_SCANNER_IMAGE?.trim() || 'sonarsource/sonar-scanner-cli:11.5';

const dockerArgs = buildDockerScannerArgs({
  cwd,
  dockerPlatform,
  scannerImage,
  scannerProperties: scannerPropertiesWithAnalysisContext,
});

try {
  run('docker', dockerArgs);
} catch (error) {
  console.error('Failed to run sonar scan via Docker.');
  console.error('Make sure Docker Desktop is installed and running.');
  console.error(String(error));
  process.exit(1);
}
