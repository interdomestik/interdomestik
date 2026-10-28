import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { deriveM4DatabaseTlsSource } from './db-access-m4-database-tls-source.mjs';
import { deriveM4PrivateRuntimeSource, FILES } from './db-access-m4-runtime-source.mjs';
import { deriveM4AssignmentNotification } from './db-access-m4-notification-source.mjs';
const read = file => fs.readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
const postureSource = read(FILES.posture),
  bootstrapSource = read(FILES.bootstrap);
const notificationRuntimeSource = read('apps/web/src/server/operations/m4-notification-runtime.ts');
const notifierSource = read('apps/web/src/server/operations/m4-assignment-postcommit.ts');
const runtime = {
  bootstrapSource,
  postureSource,
  contextSource: read(FILES.context),
  commandSource: read(FILES.command),
  retirementSource: read(FILES.retirement),
  runtimeTypesSource: read(FILES.runtimeTypes),
  controllerTypesSource: read(FILES.controllerTypes),
};
const notification = { postureSource, notificationRuntimeSource, notifierSource };
const inputs = {
  bootstrap: { postureSource, poolSource: bootstrapSource, poolRole: 'bootstrap' },
  notification: { postureSource, poolSource: notificationRuntimeSource, poolRole: 'notification' },
};
function once(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, 'one exact mutation target');
  const changed = source.replace(needle, () => replacement);
  assert.notEqual(changed, source);
  assert.equal(
    ts.createSourceFile('mutation.ts', changed, ts.ScriptTarget.ES2022, true).parseDiagnostics
      .length,
    0
  );
  return changed;
}
function refusal(name, role, key, needle, replacement) {
  test('finite TLS source law refuses ' + name, () => {
    const altered = { ...inputs[role], [key]: once(inputs[role][key], needle, replacement) };
    assert.throws(() => deriveM4DatabaseTlsSource(altered), /database TLS source rejected/);
    // Also require refusal through the actual surrounding complete-module derivation.
    if (role === 'bootstrap')
      assert.throws(
        () =>
          deriveM4PrivateRuntimeSource({
            ...runtime,
            postureSource: altered.postureSource,
            bootstrapSource: altered.poolSource,
          }),
        /source rejected/
      );
    else
      assert.throws(
        () =>
          deriveM4AssignmentNotification({
            ...notification,
            postureSource: altered.postureSource,
            notificationRuntimeSource: altered.poolSource,
          }),
        /source rejected/
      );
  });
}
export {
  read,
  postureSource,
  bootstrapSource,
  notificationRuntimeSource,
  notifierSource,
  runtime,
  notification,
  inputs,
  once,
  refusal,
};
