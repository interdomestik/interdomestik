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
const LOCAL_SONAR_URLS = new Map([
  ['host.docker.internal:9000', `${LOCAL_SONAR_PROTOCOL}//host.docker.internal:9000`],
  ['sonarqube:9000', `${LOCAL_SONAR_PROTOCOL}//sonarqube:9000`],
]);

function stripTrailingSlashes(pathname) {
  let end = pathname.length;
  while (end > 1 && pathname.codePointAt(end - 1) === 47) {
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
  const localUrl = LOCAL_SONAR_URLS.get(localHost);
  if (parsed.protocol === LOCAL_SONAR_PROTOCOL && localUrl && pathname === '/') {
    return localUrl;
  }

  throw new Error(
    'SONAR_HOST_URL must be https://sonarcloud.io or an approved local SonarQube URL.'
  );
}

export function resolveSonarStatusTarget({ sonarHostUrl, forceNative = false } = {}) {
  if (sonarHostUrl === `${LOCAL_SONAR_PROTOCOL}//host.docker.internal:9000`) {
    return forceNative ? 'host-docker-native' : 'local-docker';
  }
  if (sonarHostUrl === `${LOCAL_SONAR_PROTOCOL}//sonarqube:9000`) {
    return forceNative ? 'sonarqube-native' : 'local-docker';
  }
  return null;
}

function fetchSonarStatus(target) {
  const options = { signal: AbortSignal.timeout(2500) };

  switch (target) {
    case 'local-docker':
      return fetch(`${LOCAL_SONAR_PROTOCOL}//localhost:9000/api/system/status`, options);
    case 'host-docker-native':
      return fetch(`${LOCAL_SONAR_PROTOCOL}//host.docker.internal:9000/api/system/status`, options);
    case 'sonarqube-native':
      return fetch(`${LOCAL_SONAR_PROTOCOL}//sonarqube:9000/api/system/status`, options);
    default:
      throw new Error('Unknown local SonarQube status target.');
  }
}

export async function waitForSonarUp({ statusTarget, timeoutMs }) {
  const start = Date.now();
  const sleepMs = 1500;

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetchSonarStatus(statusTarget);
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.status === 'UP') return;
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Unknown local SonarQube status target.') {
        throw error;
      }
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
