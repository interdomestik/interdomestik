// Test fixtures for the verification-machine marker: visibly synthetic, no real machine data.
export const FIXTURE_DIGEST = `sha256:${'a'.repeat(64)}`;
export const FIXTURE_HARDWARE_SHA256 = 'b'.repeat(64);

export function fixtureMarker(overrides = {}) {
  return {
    schema: 'interdomestik.verify-machine/1',
    created_at: '2026-11-19T10:00:00.000Z',
    machine: { hardware_uuid_sha256: FIXTURE_HARDWARE_SHA256, arch: 'arm64' },
    os: { version: '99.1', build: '99Z901' },
    node: 'v24.99.0',
    pnpm: '10.99.0',
    container_runtime: { context: 'orbstack', engine: '99.0.0' },
    database: {
      image: `postgres:16@${FIXTURE_DIGEST}`,
      container: 'ida-mac-verify-pg',
      host: '127.0.0.1',
      port: 55438,
      name: 'interdomestik_test',
    },
    app_port: 3310,
    forbidden_ports: [3000, 54322],
    min_free_gib: 20,
    ...overrides,
  };
}

export function fixtureLive(overrides = {}) {
  const url = 'postgresql://postgres:postgres@127.0.0.1:55438/interdomestik_test';
  return {
    hardwareUuidSha256: FIXTURE_HARDWARE_SHA256,
    arch: 'arm64',
    os: { version: '99.1', build: '99Z901' },
    node: 'v24.99.0',
    pnpm: '10.99.0',
    container: { context: 'orbstack', engine: '99.0.0' },
    database: {
      image: `postgres:16@${FIXTURE_DIGEST}`,
      running: true,
      bindings: [{ containerPort: '5432/tcp', hostIp: '127.0.0.1', hostPort: '55438' }],
    },
    ciPostgresDigest: FIXTURE_DIGEST,
    env: {
      DATABASE_URL: url,
      DATABASE_URL_RLS: url,
      E2E_DATABASE_URL: url,
      E2E_DATABASE_URL_RLS: url,
      PW_PORT: '3310',
      PILOT_HOST: 'pilot.127.0.0.1.nip.io:3310',
    },
    sources: { localFiles: [], unexpected: [] },
    freeGib: { repository: 120, system: 28 },
    git: { head: 'c'.repeat(40), clean: true, trackedClean: true, hiddenFromStatus: 0 },
    ...overrides,
  };
}
