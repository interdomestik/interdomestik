export function appendScannerProperties(scannerProperties, { skipJreProvisioning = false } = {}) {
  const properties = [...scannerProperties];

  if (
    skipJreProvisioning &&
    !properties.some(property => property.startsWith('-Dsonar.scanner.skipJreProvisioning='))
  ) {
    properties.push('-Dsonar.scanner.skipJreProvisioning=true');
  }

  return properties;
}

export function appendPullRequestScannerProperties(
  scannerProperties,
  { pullRequestKey = '', pullRequestBranch = '', pullRequestBase = '' } = {}
) {
  const properties = [...scannerProperties];

  if (!pullRequestKey) {
    return properties;
  }

  const prProperties = [
    ['key', pullRequestKey],
    ['branch', pullRequestBranch],
    ['base', pullRequestBase],
  ];

  for (const [suffix, value] of prProperties) {
    if (!value) {
      continue;
    }

    const propertyPrefix = `-Dsonar.pullrequest.${suffix}=`;
    if (!properties.some(property => property.startsWith(propertyPrefix))) {
      properties.push(`${propertyPrefix}${value}`);
    }
  }

  return properties;
}

export function buildNativeScannerArgs(scannerProperties) {
  return ['dlx', '--package=@sonar/scan', 'sonar-scanner', ...scannerProperties];
}

const SONARCLOUD_HOST_URL = 'https://sonarcloud.io';
const LOCAL_SONAR_PROTOCOL = 'http:';
const LOCAL_SONAR_HOSTS = new Set(['host.docker.internal:9000', 'sonarqube:9000']);

function stripTrailingSlashes(pathname) {
  let end = pathname.length;
  while (end > 1 && pathname.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return pathname.slice(0, end);
}

function parseSonarHostUrl(rawHostUrl) {
  try {
    return new URL(rawHostUrl);
  } catch {
    throw new Error(
      'SONAR_HOST_URL must be a valid URL without credentials, query parameters, or fragments.'
    );
  }
}

function localStatusUrl(host) {
  const statusUrl = new URL('/api/system/status', `${LOCAL_SONAR_PROTOCOL}//${host}`);
  return statusUrl.toString();
}

export function normalizeSonarHostUrl(rawHostUrl = SONARCLOUD_HOST_URL) {
  const parsed = parseSonarHostUrl(String(rawHostUrl || SONARCLOUD_HOST_URL).trim());
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SONAR_HOST_URL must not include credentials, query parameters, or fragments.');
  }

  const pathname = stripTrailingSlashes(parsed.pathname);
  if (parsed.protocol === 'https:' && parsed.host.toLowerCase() === 'sonarcloud.io') {
    if (pathname !== '/') {
      throw new Error('SONAR_HOST_URL for SonarCloud must be https://sonarcloud.io.');
    }
    return SONARCLOUD_HOST_URL;
  }

  const localHost = parsed.host.toLowerCase();
  if (
    parsed.protocol === LOCAL_SONAR_PROTOCOL &&
    LOCAL_SONAR_HOSTS.has(localHost) &&
    pathname === '/'
  ) {
    return `${LOCAL_SONAR_PROTOCOL}//${localHost}`;
  }

  throw new Error(
    'SONAR_HOST_URL must be https://sonarcloud.io or an approved local SonarQube URL.'
  );
}

export function resolveSonarStatusUrl({ sonarHostUrl, forceNative = false } = {}) {
  const parsed = parseSonarHostUrl(sonarHostUrl);
  const localHost = parsed.host.toLowerCase();

  if (parsed.protocol !== LOCAL_SONAR_PROTOCOL || !LOCAL_SONAR_HOSTS.has(localHost)) {
    return null;
  }

  return forceNative ? localStatusUrl(localHost) : localStatusUrl('localhost:9000');
}

export async function waitForSonarUp({ statusUrl, timeoutMs }) {
  const start = Date.now();
  const sleepMs = 1500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(statusUrl, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.status === 'UP') return;
      }
    } catch {
      // ignore and retry
    }

    const elapsed = Date.now() - start;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, Math.min(sleepMs, remaining)));
  }

  throw new Error(`SonarQube did not become ready within ${timeoutMs}ms.`);
}
