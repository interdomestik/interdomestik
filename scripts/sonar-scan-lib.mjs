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

export function buildNativeScannerArgs(scannerProperties) {
  return ['dlx', '--package=@sonar/scan', 'sonar-scanner', ...scannerProperties];
}
