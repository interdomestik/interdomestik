export function assertRenderingBuildMode(builtMode: unknown, runtimeMode: unknown): void {
  if (builtMode !== 'off' && builtMode !== 'report') {
    throw new Error('Invalid compiled CSP nonce mode; rebuild the application.');
  }

  const mode = runtimeMode === undefined ? 'off' : runtimeMode;
  if (mode !== 'off' && mode !== 'report') {
    throw new Error('Invalid CSP_NONCE_MODE. Expected "off" or "report"; enforce is unsupported.');
  }

  if (mode !== builtMode) {
    throw new Error('CSP_NONCE_MODE does not match the compiled build; use a matching artifact.');
  }
}
