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

export function normalizeSonarHostUrl(rawHostUrl) {
  const parsed = new URL(rawHostUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('SONAR_HOST_URL must use http or https.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SONAR_HOST_URL must not include credentials, query parameters, or fragments.');
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, '')}`;
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

    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }

  throw new Error(`SonarQube did not become ready within ${timeoutMs}ms.`);
}
