import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  approved,
  authorityFixture,
  evidenceFixture,
  head,
  lockfile,
  now,
} from './verification-evidence-test-fixture.mjs';
import { checkLiveAuthority, checkTicket, issueTicket } from './verification-evidence/ticket.mjs';

test('the exact signed attempt authenticates and binds the receipt bytes', t => {
  const f = evidenceFixture(t);
  assert.equal(f.verify().receiptSha256, f.save());
});

test('authority refuses cancelled and superseded attempts even with the original identity', () => {
  const identity = authorityFixture();
  assert.deepEqual(checkLiveAuthority({ state: 'eligible', identity }, identity), identity);
  for (const state of ['cancelled', 'superseded', 'stale']) {
    assert.throws(() => checkLiveAuthority({ state, identity }, identity), /attempt-ineligible/u);
  }
  assert.throws(
    () => checkLiveAuthority({ state: 'eligible', identity }, authorityFixture()),
    /attempt-mismatch/u
  );
});

test('missing, empty, malformed and valid-but-empty signed documents fail closed', async t => {
  for (const name of ['ticket', 'receipt']) {
    for (const bad of [null, '', '{', '{}']) {
      await t.test(`${name}: ${JSON.stringify(bad)}`, sub => {
        const f = evidenceFixture(sub);
        if (bad === null) rmSync(path.join(f.dir, `${name}.json`));
        else f.signed(name, bad);
        assert.throws(() => f.verify());
      });
    }
  }
});

test('the ticket expires when Git refs, review, policy, configuration or attempt change', t => {
  const { current, verify, receipt } = evidenceFixture(t);
  assert.throws(() => verify(current, receipt.ticket.expiresAt), /expired/u);
  assert.throws(() => verify(current, now, { ...approved, sha256: 'b'.repeat(64) }), /policy/u);
  for (const key of ['repo', 'subject', 'attempt', 'reviewSha256', 'configurationSha256']) {
    const value = authorityFixture()[key];
    const changed = {
      repo: 'example/other',
      subject: 'pr:2154',
      attempt: value,
      reviewSha256: 'a'.repeat(64),
      configurationSha256: 'b'.repeat(64),
    }[key];
    assert.throws(() => verify({ ...current, [key]: changed }), /stale/u);
  }
  for (const key of ['main', 'head', 'tree']) {
    const changed = structuredClone(current);
    changed[key] = '7'.repeat(40);
    changed.merge = { ...changed.merge, parents: [changed.main, changed.head], tree: changed.tree };
    assert.throws(() => verify(changed), /stale/u);
  }
  // #2157 had different pregate and reviewed heads, even if a tree happens to be identical.
  const pregate = { ...current, head: `774a6443d${'0'.repeat(31)}` };
  pregate.merge = { ...current.merge, parents: [current.main, pregate.head] };
  const final = { ...current, head: `0d56cac89${'0'.repeat(31)}` };
  final.merge = { ...current.merge, parents: [current.main, final.head] };
  assert.throws(
    () => checkTicket(issueTicket(pregate, approved, lockfile, now), approved, now, final),
    /stale/u
  );
  assert.throws(
    () => verify({ ...current, merge: { ...current.merge, parents: [head, current.main] } }),
    /git-identity/u
  );
});

test('signed partial, skipped, cancelled, failed and wrong-role receipts fail closed', async t => {
  const cases = {
    'zero-exit PRE-CHECK': r => {
      r.class = 'PRE-CHECK';
    },
    'wrong role': r => {
      r.machineRole = 'm4';
    },
    'no lanes': r => {
      r.lanes = [];
    },
    'omitted lane': r => {
      r.lanes.pop();
    },
    'duplicate lane': r => {
      r.lanes[1] = r.lanes[0];
    },
    'serial contracts': r => {
      r.lanes[1].command = 'pnpm test:ci:contracts';
    },
    'failed lane': r => {
      r.lanes[2].exit = 1;
    },
    'failed job': r => {
      r.exit = 1;
    },
    'cancelled job': r => {
      r.completed = false;
    },
    'unexpected runner': r => {
      r.runnerSha256 = 'a'.repeat(64);
    },
    'unexpected manifest': r => {
      r.manifestSha256 = 'b'.repeat(64);
    },
    'Bash 3.2': r => {
      r.start.bash = '3.2.57';
      r.finish.bash = '3.2.57';
    },
    'wrong slot': r => {
      r.start.slot = 'B';
      r.finish.slot = 'B';
    },
    'marker drift': r => {
      r.finish.markerSha256 = 'b'.repeat(64);
    },
    'OrbStack drift': r => {
      r.finish.container.engine = '100.1';
    },
    'socket drift': r => {
      r.finish.container.socket = 'unix:///other.sock';
    },
    'unready database': r => {
      r.start.container.ready = false;
      r.finish.container.ready = false;
    },
    'finish tree drift': r => {
      r.finish.git.tree = 'a'.repeat(40);
    },
    'lockfile drift': r => {
      r.start.git.lockfileSha256 = 'a'.repeat(64);
    },
    'missing report digest': r => {
      r.lanes.find(lane => lane.id === 'i18n-purity').reports = {};
    },
    'impossible time': r => {
      r.finishedAt = r.ticket.expiresAt;
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    await t.test(name, sub => {
      const f = evidenceFixture(sub);
      mutate(f.receipt);
      f.save();
      assert.throws(() => f.verify());
    });
  }
});

test('the signed probe needs every observed machine, tool, container and port field', async t => {
  const fields = [
    'machine.hardware_uuid_sha256',
    'machine.arch',
    'os.version',
    'os.build',
    'toolPath',
    'executables.node',
    'executables.pnpm',
    'executables.bash',
    'node',
    'pnpm',
    'bash',
    'container.context',
    'container.engine',
    'container.socket',
    'container.id',
    'container.imageId',
    'container.image',
    'container.ready',
    'container.databaseHost',
    'container.databasePort',
    'appPort',
  ];
  for (const field of fields) {
    await t.test(field, sub => {
      const f = evidenceFixture(sub);
      const [first, second] = field.split('.');
      for (const probe of [f.receipt.start, f.receipt.finish]) {
        if (second) delete probe[first][second];
        else delete probe[first];
      }
      f.save();
      assert.throws(() => f.verify(), /m5-probe/u);
    });
  }
});

test('collected files and signatures must match, including simultaneous receipt and log replacement', async t => {
  for (const log of ['job.log', 'contracts.log', 'i18n-purity.json', 'install.log']) {
    await t.test(log, sub => {
      const f = evidenceFixture(sub);
      assert.throws(() => {
        f.write(log, 'truncated\n');
        f.verify();
      }, /digest/u);
      assert.throws(() => {
        f.write(log, '');
        f.verify();
      }, /artifact-file/u);
      rmSync(path.join(f.dir, log));
      assert.throws(() => f.verify());
    });
  }
  const f = evidenceFixture(t);
  f.receipt.logSha256 = f.write('job.log', 'replacement transcript\n');
  f.write('receipt.json', JSON.stringify(f.receipt));
  assert.throws(() => f.verify(), /signature mismatch/u);
  f.signed('receipt', JSON.stringify(f.receipt), 'm4');
  assert.throws(() => f.verify(), /signature mismatch/u);
  f.receipt.lanes.find(lane => lane.id === 'i18n-purity').reports['i18n-purity.json'] = f.write(
    'i18n-purity.json',
    '{}'
  );
  f.save();
  assert.throws(() => f.verify(), /i18n-purity-report/u);
  rmSync(path.join(f.dir, 'receipt.sig'));
  assert.throws(() => f.verify(), /ENOENT/u);
});
