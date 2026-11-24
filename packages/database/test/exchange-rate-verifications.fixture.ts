import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';

import { setRateVerificationLimit } from '../src/scripts/rate-verification-limit';
import { withPaymentPortReleaseClient } from './exchange-rates-release-client.fixture';
import {
  firstRate,
  insertRate,
  restricted,
  runtimeRole,
  type ExchangeRateFixture,
} from './exchange-rates.fixture';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';

export type Verification = Awaited<ReturnType<typeof makeVerification>>;

export function insertVerification(tx: postgres.TransactionSql, candidate: Verification) {
  return tx<
    { server_stamp: boolean }[]
  >`insert into public.exchange_rate_verifications ${tx(candidate)}
    returning verified_at >= transaction_timestamp() and verified_at <= clock_timestamp() as server_stamp`;
}

export async function makeVerification(
  { admin, bookRows }: ExchangeRateFixture,
  tenantId: string,
  actorId: string
) {
  const entityId = randomUUID();
  await admin`insert into public.legal_entities (id, tenant_id, legal_name, country_code)
    values (${entityId}, ${tenantId}, 'Test entity', 'MK')`;
  const [book] = await bookRows(tenantId);
  assert.ok(book);
  const rate = firstRate(tenantId, book.id, '2000-01-03');
  await restricted(admin, tenantId, tx => insertRate(tx, rate));
  await withPaymentPortReleaseClient(admin, client =>
    setRateVerificationLimit(client, {
      tenantId,
      maxAgeSeconds: 3600,
      operationId: randomUUID(),
      approvalReference: 'limit-fixture',
      releaseIdentity: 'test-release',
    })
  );
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    book_id: book.id,
    rate_id: rate.id,
    legal_entity_id: entityId,
    base: rate.base,
    quote: rate.quote,
    rate_effective_on: rate.effective_on,
    observed_rate: rate.rate,
    source_ref: 'nbrm:2000-01-03',
    verified_by: actorId,
    verified_at: 'infinity',
    operation_key: randomUUID(),
  };
}

export async function assertForeignVerificationParentsVisible(
  tx: postgres.TransactionSql,
  { tenant_id, book_id, rate_id, legal_entity_id, base, quote }: Verification
) {
  const [book] = await tx`select id from public.exchange_rate_books
    where tenant_id = ${tenant_id} and id = ${book_id} and base = ${base} and quote = ${quote}
    for update`;
  const [entity] = await tx`select id from public.legal_entities
    where tenant_id = ${tenant_id} and id = ${legal_entity_id} and is_active for share`;
  const [rate] = await tx`select id from public.exchange_rates
    where tenant_id = ${tenant_id} and book_id = ${book_id}
      and stored_at <= clock_timestamp()
      and effective_on <= (clock_timestamp() at time zone 'Europe/Skopje')::date
    order by effective_on desc, revision desc limit 1`;
  assert.equal(book?.id, book_id);
  assert.equal(entity?.id, legal_entity_id);
  assert.equal(rate?.id, rate_id);
}

// The transaction rolls back these policies with the refused cross-tenant insert.
export async function showForeignVerificationParents(
  tx: postgres.TransactionSql,
  foreign: Verification
) {
  const role = quoteIdentifier(runtimeRole);
  const book = quoteSqlLiteral(foreign.book_id);
  const entity = quoteSqlLiteral(foreign.legal_entity_id);
  const rate = quoteSqlLiteral(foreign.rate_id);
  await tx.unsafe(`create policy wp07_test_foreign_verification_book on public.exchange_rate_books
    for select to ${role} using (id = ${book})`);
  await tx.unsafe(`create policy wp07_test_foreign_verification_book_lock on public.exchange_rate_books
    for update to ${role} using (id = ${book}) with check (false)`);
  await tx.unsafe(`create policy wp07_test_foreign_verification_entity on public.legal_entities
    for select to ${role} using (id = ${entity})`);
  await tx.unsafe(`create policy wp07_test_foreign_verification_entity_lock on public.legal_entities
    for update to ${role} using (id = ${entity}) with check (false)`);
  await tx.unsafe(`create policy wp07_test_foreign_verification_rate on public.exchange_rates
    for select to ${role} using (id = ${rate})`);
}
