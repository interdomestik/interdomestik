import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import type { TestContext } from 'node:test';
import { assertRefusal, type releaseFixture } from './release-migration-fixture';

type Fixture = Awaited<ReturnType<typeof releaseFixture>>;

export async function exerciseRefusals(
  t: TestContext,
  fixture: Fixture,
  afterRefusal: () => Promise<void>
) {
  const { run, approval, receipt, live, livePath } = fixture;
  const expired = receipt();
  const wrongBuild = receipt();
  expired.expiresAt = expired.observedAt;
  const staleApproval = approval();
  const refusals = [
    ['missing', approval(receipt(), { raw: null }), 'RECEIPT_MISSING_OR_SIZE'],
    ['empty', approval(receipt(), { raw: Buffer.alloc(0) }), 'RECEIPT_MISSING_OR_SIZE'],
    ['unparseable', approval(receipt(), { raw: Buffer.from('{') }), 'RECEIPT_JSON_INVALID'],
    ['valid empty', approval(receipt(), { raw: Buffer.from('{}') }), 'RECEIPT_SHAPE_INVALID'],
    ['forged', approval(receipt(), { forged: true }), 'RECEIPT_SIGNATURE_INVALID'],
    [
      'wrong manifest',
      approval({ ...receipt(), manifestSha256: '0'.repeat(64) }),
      'RECEIPT_BINDING_MISMATCH',
    ],
    [
      'wrong attempt',
      { ...approval(), RELEASE_PHASE_ATTEMPT: '0'.repeat(64) },
      'RECEIPT_BINDING_MISMATCH',
    ],
    [
      'wrong build digest',
      approval({
        ...wrongBuild,
        deployment: { ...wrongBuild.deployment, buildDigest: `sha256:${'0'.repeat(64)}` },
      }),
      'DEPLOYMENT_ATTESTATION_MISMATCH',
    ],
    ['expired', approval(expired), 'RECEIPT_EXPIRED'],
    [
      'missing manifest',
      { ...approval(), RELEASE_PHASE_MANIFEST: fixture.files('absent') },
      'MANIFEST_MISSING_OR_SIZE',
    ],
  ] as const;
  await refusals.reduce(
    (previous, [name, input, reason]) =>
      previous.then(() =>
        t.test(name, async () => {
          assertRefusal(await run('contract', input), reason);
          await afterRefusal();
        })
      ),
    Promise.resolve()
  );
  await t.test('alias moved away and back to the same deployment', async () => {
    writeFileSync(
      livePath,
      JSON.stringify({ ...live, alias: { ...live.alias, updatedAt: live.alias.updatedAt + 1 } })
    );
    assertRefusal(await run('contract', staleApproval), 'CANONICAL_ALIAS_MISMATCH');
    await afterRefusal();
  });
  await t.test('replay of consumed approval while still at expand', async () => {
    writeFileSync(livePath, JSON.stringify(live));
    assertRefusal(await run('contract', staleApproval), 'RECEIPT_REPLAYED');
    await afterRefusal();
  });
}

export async function proveContractOnce(fixture: Fixture) {
  const approval = fixture.approval();
  const results = await Promise.all([
    fixture.run('contract', approval),
    fixture.run('contract', approval),
  ]);
  const [committed, refused] = results.sort((a, b) => Number(a.code) - Number(b.code));
  assert.equal(committed.code, 0, committed.stderr);
  assert.equal(JSON.parse(committed.stdout).status, 'contracted');
  assertRefusal(refused, 'RECEIPT_REPLAYED');
}
