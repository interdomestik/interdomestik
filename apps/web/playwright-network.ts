export function resolvePlaywrightNetwork(
  environment: Record<string, string | undefined> = process.env
) {
  const configuredPort = environment.PW_PORT ?? environment.PORT ?? '3000';
  if (!/^\d+$/.test(configuredPort)) {
    throw new Error('PW_PORT/PORT must be a numeric TCP port');
  }

  const port = Number(configuredPort);
  if (port < 1 || port > 65535) {
    throw new Error('PW_PORT/PORT must be between 1 and 65535');
  }

  const host = '127.0.0.1';
  return {
    BASE_HOST: host,
    BASE_URL: `http://${host}:${port}`,
    BIND_HOST: host,
    PORT: port,
  };
}
