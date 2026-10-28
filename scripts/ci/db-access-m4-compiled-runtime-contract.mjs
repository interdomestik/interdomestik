import fs from 'node:fs';
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const M4_COMPILED_RUNTIME_CONTRACT = freeze(
  JSON.parse(
    fs.readFileSync(
      new URL('./db-access-m4-compiled-runtime-contract.json', import.meta.url),
      'utf8'
    )
  )
);

export const M4_COMPILED_PRODUCER_FILES = Object.freeze([
  'db-access-m4-compiled-backend-child.mjs',
  'db-access-m4-compiled-backend-client.mjs',
  'db-access-m4-compiled-backend-closure.mjs',
  'db-access-m4-compiled-completion.mjs',
  'db-access-m4-compiled-driver-channel.mjs',
  'db-access-m4-compiled-driver.mjs',
  'db-access-m4-compiled-entry.ts',
  'db-access-m4-compiled-fixture.mjs',
  'db-access-m4-compiled-layout.mjs',
  'db-access-m4-compiled-materialize.mjs',
  'db-access-m4-compiled-observations.mjs',
  'db-access-m4-compiled-persist.mjs',
  'db-access-m4-compiled-platform.mjs',
  'db-access-m4-compiled-producer-auth.mjs',
  'db-access-m4-compiled-producer-loader.mjs',
  'db-access-m4-compiled-runtime-contract.json',
  'db-access-m4-compiled-runtime-contract.mjs',
  'db-access-m4-compiled-runtime.mjs',
  'db-access-m4-compiled-provision.mjs',
  'db-access-m4-compiled-ops-observation.mjs',
  'db-access-m4-platform-browser-control.mjs',
  'db-access-m4-platform-browser.mjs',
  'db-access-m4-platform-controls.mjs',
  'db-access-m4-platform-custody.mjs',
  'db-access-m4-platform-kernel-probe.mjs',
  'db-access-m4-platform-native-source.mjs',
  'db-access-m4-platform-next.mjs',
  'db-access-m4-platform-preload.mjs',
  'db-access-m4-platform-process.mjs',
  'db-access-m4-platform-tls.mjs',
  'db-access-m4-platform-tools.json',
  'db-access-m4-platform-tools.mjs',
]);
