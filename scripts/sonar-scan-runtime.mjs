import { spawnSync } from 'node:child_process';
import process from 'node:process';

function environmentValue(environment, key) {
  return String(environment[key] || '').trim();
}

function appendProperty(properties, name, value) {
  if (!value) return;

  const prefix = `-D${name}=`;
  if (!properties.some(property => property.startsWith(prefix))) {
    properties.push(`${prefix}${value}`);
  }
}

export function appendScannerProperties(scannerProperties, { skipJreProvisioning = false } = {}) {
  const properties = [...scannerProperties];
  appendProperty(
    properties,
    'sonar.scanner.skipJreProvisioning',
    skipJreProvisioning ? 'true' : ''
  );
  return properties;
}

export function appendPullRequestScannerProperties(scannerProperties, context = {}) {
  const properties = [...scannerProperties];
  if (!context.pullRequestKey) return properties;

  appendProperty(properties, 'sonar.pullrequest.key', context.pullRequestKey);
  appendProperty(properties, 'sonar.pullrequest.branch', context.pullRequestBranch);
  appendProperty(properties, 'sonar.pullrequest.base', context.pullRequestBase);
  return properties;
}

export function buildNativeScannerArgs(scannerProperties) {
  return ['dlx', '--package=@sonar/scan@5.0.0', 'sonar-scanner-npm', ...scannerProperties];
}

const LOCAL_ONLY_SONAR_PROTOCOL = 'http:';
const localOnlySonarUrl = host => `${LOCAL_ONLY_SONAR_PROTOCOL}//${host}`;
// Plain HTTP is restricted to these approved local endpoints; remote scanner URLs stay unchanged.
const DOCKER_LOCAL_SONAR_HOSTS = new Set(
  ['127.0.0.1:9000', 'localhost:9000', 'sonarqube:9000'].map(localOnlySonarUrl)
);
const DOCKER_REACHABLE_SONAR_HOST = localOnlySonarUrl('host.docker.internal:9000');

export function buildDockerScannerArgs({
  cwd,
  dockerPlatform = '',
  scannerImage,
  scannerProperties,
  platform = process.platform,
}) {
  const args = ['run', '--rm'];
  if (dockerPlatform) args.push('--platform', dockerPlatform);
  if (platform === 'linux') {
    args.push('--add-host', 'host.docker.internal:host-gateway');
  }
  const dockerProperties = scannerProperties.map(property => {
    const prefix = '-Dsonar.host.url=';
    if (!property.startsWith(prefix)) return property;
    const hostUrl = property.slice(prefix.length);
    return DOCKER_LOCAL_SONAR_HOSTS.has(hostUrl)
      ? `${prefix}${DOCKER_REACHABLE_SONAR_HOST}`
      : property;
  });
  args.push(
    '-e',
    'SONAR_TOKEN',
    '-v',
    `${cwd}:/usr/src`,
    '-w',
    '/usr/src',
    scannerImage,
    'sonar-scanner',
    ...dockerProperties
  );
  return args;
}

export function resolveSonarAnalysisContext(environment = process.env) {
  const projectVersion = environmentValue(environment, 'SONAR_PROJECT_VERSION');
  const qualityGateWait = environmentValue(environment, 'SONAR_QUALITYGATE_WAIT');
  const pullRequestKey = environmentValue(environment, 'SONAR_PULLREQUEST_KEY');
  const pullRequestBranch =
    environmentValue(environment, 'SONAR_PULLREQUEST_BRANCH') ||
    environmentValue(environment, 'GITHUB_HEAD_REF');
  const pullRequestBase =
    environmentValue(environment, 'SONAR_PULLREQUEST_BASE') ||
    environmentValue(environment, 'GITHUB_BASE_REF');

  if (projectVersion && !/^[0-9a-f]{40}$/u.test(projectVersion)) {
    throw new Error('SONAR_PROJECT_VERSION must be an exact 40-character SHA.');
  }
  if (qualityGateWait && qualityGateWait !== 'true' && qualityGateWait !== 'false') {
    throw new Error('SONAR_QUALITYGATE_WAIT must be true or false.');
  }
  if (pullRequestKey && (!pullRequestBranch || !pullRequestBase)) {
    throw new Error(
      [
        'Missing pull request branch context for Sonar PR analysis.',
        `pull request key present: ${pullRequestKey ? 'yes' : 'no'}`,
        `pull request branch present: ${pullRequestBranch ? 'yes' : 'no'}`,
        `pull request base present: ${pullRequestBase ? 'yes' : 'no'}`,
      ].join('\n')
    );
  }

  return {
    projectVersion,
    pullRequestBase,
    pullRequestBranch,
    pullRequestKey,
    qualityGateWait,
  };
}

export function appendSonarAnalysisProperties(scannerProperties, analysisContext = {}) {
  const properties = [...scannerProperties];
  appendProperty(properties, 'sonar.projectVersion', analysisContext.projectVersion);
  appendProperty(properties, 'sonar.qualitygate.wait', analysisContext.qualityGateWait);
  return properties;
}

export function runCommand(command, args, options = {}) {
  const { allowFailure = false, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...spawnOptions,
  });

  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    if (allowFailure) return result.status;
    process.exit(result.status);
  }
  return result.status ?? 0;
}
