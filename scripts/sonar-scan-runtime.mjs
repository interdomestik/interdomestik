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
