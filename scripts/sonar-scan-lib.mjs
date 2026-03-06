export function buildNativeScannerArgs(scannerProperties) {
  return ['dlx', '--package=@sonar/scan', 'sonar-scanner', ...scannerProperties];
}
