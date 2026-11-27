import { randomUUID } from 'node:crypto';
import { restricted, withLockedBook } from '../../../../database/test/exchange-rates.fixture';
import { expect, it } from 'vitest';

import { holdingChange, race } from './individual-sale-offer-races.test-support';
import { refused, success } from './individual-sales.test-support';
import { ageCandidate, insertEvidence, type AgeFixture } from './rate-age.test-support';

function insertInconclusive(
  tx: Parameters<typeof insertEvidence>[1],
  checkId: string | undefined,
  operationKey: string = randomUUID()
) {
  return tx`insert into exchange_rate_check_events (id, tenant_id, book_id, window_id,
      legal_entity_id, actor_id, rate_id, rate_effective_on, kind, check_id, operation_key, reason)
    select ${randomUUID()}, tenant_id, book_id, window_id, legal_entity_id, actor_id, rate_id,
      rate_effective_on, 'inconclusive', id, ${operationKey}, 'Official source unavailable'
    from exchange_rate_check_events where id = ${checkId ?? null} returning id`;
}

export function registerVerificationConcurrencyCases(fixture: AgeFixture) {
  it.each(['positive', 'inconclusive'] as const)(
    'serializes independent restricted SQL terminals when %s inserts first',
    async first => {
      const f = await fixture();
      const { evidence } = await ageCandidate(f);
      const positive = (tx: Parameters<typeof insertEvidence>[1]) =>
        insertEvidence(f, tx, evidence);
      const inconclusive = (tx: Parameters<typeof insertEvidence>[1]) =>
        insertInconclusive(tx, evidence.checkId);
      const [winner, loser] =
        first === 'positive'
          ? ([positive, inconclusive] as const)
          : ([inconclusive, positive] as const);
      const { second } = await race(
        f,
        holdingChange(f, async tx => {
          expect(await winner(tx)).toHaveLength(1);
        }),
        () =>
          restricted(f.peer, f.tenantId, async tx => {
            await loser(tx);
          }).then(
            () => ({ committed: true }),
            (error: unknown) => error
          )
      );
      expect(second).toMatchObject({
        code: '23505',
        constraint_name: 'exchange_rate_check_terminal_guard',
      });
      const [counts] = await restricted(
        f.peer,
        f.tenantId,
        tx => tx`
        select (select count(*)::int from exchange_rate_verifications where check_id = ${evidence.checkId ?? null}) as positive,
          (select count(*)::int from exchange_rate_check_events where check_id = ${evidence.checkId ?? null}) as negative`
      );
      expect(counts).toEqual(
        first === 'positive' ? { positive: 1, negative: 0 } : { positive: 0, negative: 1 }
      );
    },
    15000
  );

  it.each(['verification', 'start'] as const)(
    'refuses a concurrent cross-table operation key when the %s holds the book lock first',
    async first => {
      const f = await fixture();
      const { evidence } = await ageCandidate(f);
      const verificationFirst = first === 'verification';
      const operationKey = randomUUID();
      const startId = randomUUID();
      if (!verificationFirst) {
        // Close the prior check so the holder can insert a new start for the waiting verification.
        success(await f.verify(evidence));
      }

      const verification = (tx: Parameters<typeof insertEvidence>[1]) =>
        insertEvidence(f, tx, {
          ...evidence,
          operationKey,
          checkId: verificationFirst ? evidence.checkId : startId,
        });
      const start = (tx: Parameters<typeof insertEvidence>[1]) => tx`
        insert into exchange_rate_check_events
          (id, tenant_id, book_id, legal_entity_id, actor_id, kind, operation_key)
        values (${startId}, ${f.tenantId}, ${f.bookId}, ${f.legalEntityId}, ${f.owner.id},
          'start', ${operationKey}) returning id`;
      const [winner, loser] = verificationFirst ? [verification, start] : [start, verification];
      const { second } = await race(
        f,
        holdingChange(f, async tx => {
          expect(await winner(tx)).toHaveLength(1);
        }),
        () =>
          restricted(f.peer, f.tenantId, async tx => {
            expect(await loser(tx)).toHaveLength(1);
          }).then(
            () => ({ committed: true }),
            (error: unknown) => error
          )
      );
      expect(second).toMatchObject({
        code: '23505',
        constraint_name: 'exchange_rate_check_operation_guard',
      });
      const [counts] = await restricted(
        f.peer,
        f.tenantId,
        tx => tx`
          select (select count(*)::int from exchange_rate_verifications where operation_key = ${operationKey}) as verifications,
            (select count(*)::int from exchange_rate_check_events where operation_key = ${operationKey}) as events`
      );
      expect(counts).toEqual(
        verificationFirst ? { verifications: 1, events: 0 } : { verifications: 0, events: 1 }
      );
    },
    15000
  );

  it('refuses cross-table operation-key reuse across distinct checks', async () => {
    const f = await fixture();
    const { evidence: first } = await ageCandidate(f);
    await restricted(f.peer, f.tenantId, tx => insertEvidence(f, tx, first));
    const second = await f.newEvidence(first.rateId);

    const close = (operationKey: string) =>
      restricted(f.peer, f.tenantId, tx => insertInconclusive(tx, second.checkId, operationKey));
    const operationConflict = {
      code: '23505',
      constraint_name: 'exchange_rate_check_operation_guard',
    };
    await expect(close(first.operationKey)).rejects.toMatchObject(operationConflict);
    const outcomeKey = randomUUID();
    expect(await close(outcomeKey)).toHaveLength(1);

    const third = await f.newEvidence(first.rateId);
    await expect(
      restricted(f.peer, f.tenantId, tx =>
        insertEvidence(f, tx, { ...third, operationKey: outcomeKey })
      )
    ).rejects.toMatchObject(operationConflict);
    expect(await restricted(f.peer, f.tenantId, tx => insertEvidence(f, tx, third))).toHaveLength(
      1
    );
    const [counts] = await restricted(
      f.peer,
      f.tenantId,
      tx => tx`
      select (select count(*)::int from exchange_rate_verifications where operation_key = ${first.operationKey}) as original,
        (select count(*)::int from exchange_rate_check_events where operation_key = ${first.operationKey}) as reused_positive,
        (select count(*)::int from exchange_rate_check_events where operation_key = ${outcomeKey}) as outcome,
        (select count(*)::int from exchange_rate_verifications where operation_key = ${outcomeKey}) as reused_negative,
        (select count(*)::int from exchange_rate_verifications where operation_key = ${third.operationKey}) as recovered`
    );
    expect(counts).toEqual({
      original: 1,
      reused_positive: 0,
      outcome: 1,
      reused_negative: 0,
      recovered: 1,
    });
    const substitute = await f.addUser('admin', null);
    expect(
      await f.begin({ ...f.checkInput(), operationKey: first.operationKey }, substitute)
    ).toEqual(refused('not_found'));
    expect(await f.begin({ ...f.checkInput(), operationKey: first.operationKey })).toEqual(
      refused('conflict')
    );
  });

  it('refuses a completion waiting for a same-date replacement and leaves the start recoverable', async () => {
    const f = await fixture();
    const { evidence } = await ageCandidate(f);
    const { result } = await withLockedBook(
      f.peer,
      f.admin,
      f.tenantId,
      f.bookId,
      async () => {
        const replacing = f.correctRate({ id: evidence.rateId, effective_on: f.today }, '62.20');
        // The holder proves both writers below wait for the exclusive book lock.
        return Promise.all([replacing, f.verify(evidence)]);
      },
      2
    );
    const [replacement, completion] = result;
    if (completion.ok) {
      expect(completion.verification.rateId).toBe(evidence.rateId);
      expect(await f.quote()).toEqual(refused('stale_rate'));
    } else {
      expect(completion).toEqual(refused('stale_rate'));
      success(
        await f.close({
          ...f.checkInput(),
          checkId: evidence.checkId,
          reason: 'Rate replaced during review',
        })
      );
    }
    const next = await f.newEvidence(replacement.id, '62.20');
    expect(success(await f.verify(next)).verification.rateId).toBe(replacement.id);
  }, 15000);
}
