import assert from 'node:assert/strict';
import test from 'node:test';

import { E2E_CASE_FIXTURES } from '../src/e2e-role-fixtures';
import { E2E_EMAIL_DOMAIN, E2E_USERS } from '../src/e2e-users';
import { createMutationCopy } from '../src/testing/mutation-copy';

const namespace = { runId: 'run-a', workerId: 'worker-1', scenario: 'assignment' };

test('copy IDs are reproducible, isolated by run/worker/scenario and never golden', () => {
  const source = E2E_CASE_FIXTURES.KS_UNASSIGNED;
  const copy = createMutationCopy(namespace);
  assert.equal(copy.row(source).id, createMutationCopy(namespace).row(source).id);
  const variants = [
    namespace,
    { ...namespace, runId: 'run-b' },
    { ...namespace, workerId: 'worker-2' },
    { ...namespace, scenario: 'reassignment' },
  ].map(value => createMutationCopy(value).row(source).id);
  assert.equal(new Set(variants).size, variants.length);
  assert.ok(variants.every(value => value.startsWith('p070_mut_')));
  assert.ok(variants.every(value => !value.startsWith('golden_')));
});

test('copies remap relationships explicitly and cannot change nested source data', () => {
  const copy = createMutationCopy(namespace);
  const source = { ...E2E_CASE_FIXTURES.KS_ANCHOR, nested: { bytes: [1, 2] } };
  const before = structuredClone(source);
  const row = { ...copy.row(source), ownerUserId: copy.id(source.ownerUserId) };
  row.nested.bytes.push(3);
  assert.deepEqual(source, before);
  assert.equal(row.ownerUserId, copy.id(source.ownerUserId));
  assert.notEqual(row.id, source.id);
});

test('missing fixtures and incomplete namespaces fail instead of skipping', () => {
  assert.throws(() => createMutationCopy({ ...namespace, workerId: '' }), /require/);
  const copy = createMutationCopy(namespace);
  assert.throws(() => copy.row(undefined), /Missing catalogue fixture/);
  assert.throws(() => copy.row({ id: '' }), /Missing catalogue row ID/);
  assert.throws(() => copy.email(''), /Missing catalogue email/);
});

test('copy emails are isolated without changing the catalogue domain', () => {
  const copy = createMutationCopy(namespace);
  const source = E2E_USERS.KS_MEMBER.email;
  assert.equal(copy.email(source), createMutationCopy(namespace).email(source));
  assert.notEqual(copy.email(source), source);
  assert.notEqual(
    copy.email(source),
    createMutationCopy({ ...namespace, runId: 'b' }).email(source)
  );
  assert.ok(copy.email(source).endsWith(`@${E2E_EMAIL_DOMAIN}`));
});
