import assert from 'node:assert/strict';
import type postgres from 'postgres';
import type { inspectReleaseSponsorAcl } from '../../src/release-sponsor-acl';
import { sponsorCheckpointGrants, sponsorRuntimeRole } from '../../src/release-sponsor-checkpoint';
import { runSequentially } from '../in-order';
import { insert, row, TABLES, uid, type Scope } from '../sponsor-seed.test-support';
import type { ScratchClient } from './scratch-database';

const guards = new Set(['sponsors', 'membership_plans', 'claim_transition_evidence']);
const selections: Record<string, string> = {
  sponsors: 'id tenant_id branch_id source_lead_id legal_name',
  sponsor_terms: 'all',
  sponsor_term_revisions:
    'id tenant_id term_id revision seat_count price_per_seat_minor currency contract_reference terms_version created_by',
  sponsor_revision_decisions: 'id tenant_id revision_id decision decided_by',
  sponsor_roster_entries: 'all',
  sponsor_handover_intents:
    'id tenant_id user_id subscription_id provider_subscription_id state staff_disposition restoration_cutoff cancel_dispatched_at dispatch_period_ends_at attempts next_attempt_at paid_until paid_until_evidence canceled_confirmed_at reconciliation_closed_at updated_at',
  sponsor_handover_cancel_attempts: 'id tenant_id intent_id attempt_no dispatched_at outcome',
  sponsor_handover_charges: 'all',
  sponsor_mail_outbox: 'all',
};
const updates: Record<string, string> = {
  ...Object.fromEntries(sponsorCheckpointGrants),
  sponsors: 'id',
  sponsor_terms: 'terminated_effective_at terminated_by terminated_at',
  sponsor_roster_entries:
    'conflict_decision conflict_decided_at outcome review_reason user_id starts_at handover_intent_id revoked_at revoked_reason opted_out_at left_company_at',
  sponsor_handover_intents:
    'cancel_dispatched_at dispatch_period_ends_at attempts state updated_at paid_until paid_until_evidence canceled_confirmed_at reconciled_through reconciliation_closed_at next_attempt_at staff_disposition staff_evidence_id restoration_cutoff',
  sponsor_handover_cancel_attempts: 'outcome evidence_ref resolved_at',
  sponsor_handover_charges: 'staff_task_id',
  sponsor_mail_outbox: 'state lease_until attempts next_attempt_at terminal_at last_error_code',
};

type SponsorAcl = Awaited<ReturnType<typeof inspectReleaseSponsorAcl>>;

const compareAclCodes = (a: string, b: string) => a.charCodeAt(0) - b.charCodeAt(0);

function proveColumnAcl(
  relation: string,
  column: SponsorAcl[number]['columns'][number],
  sponsor: boolean,
  owner: string
) {
  const expected = [];
  const reads = selections[relation];
  if (reads === 'all' || reads?.split(' ').includes(column.name)) expected.push('SELECT');
  if (sponsor) expected.push('INSERT');
  if (updates[relation]?.split(' ').includes(column.name)) expected.push('UPDATE');
  assert.deepEqual(column.effective, expected, `${relation}.${column.name}`);
  const codes = expected
    .map(p => ({ SELECT: 'r', INSERT: 'a', UPDATE: 'w' })[p])
    .sort(compareAclCodes);
  if (expected.length) {
    const direct = column.acl?.match(/interdomestik_runtime_rls=([raw*]+)\/([^,}]+)/u);
    assert.ok(direct, `${relation}.${column.name} direct ACL`);
    assert.deepEqual([...direct[1]].sort(compareAclCodes), codes);
    assert.equal(direct[2], owner);
  } else {
    assert.ok(!column.acl?.includes(`${sponsorRuntimeRole}=`));
  }
}

export function proveSponsorRuntimeAcl(acl: SponsorAcl, owner: string) {
  const sponsorTables = new Set<string>(TABLES);
  assert.deepEqual(
    new Set(acl.map(table => table.relation)),
    new Set([...TABLES, ...sponsorCheckpointGrants.map(([relation]) => relation)])
  );
  for (const table of acl) {
    assert.deepEqual(table.effectiveTable, [], table.relation);
    const sponsor = sponsorTables.has(table.relation);
    if (sponsor) assert.equal(table.forcedRls, true, table.relation);
    for (const column of table.columns) {
      proveColumnAcl(table.relation, column, sponsor, owner);
    }
    if (guards.has(table.relation)) {
      const guard = table.triggers.find(t => t.name === `wp16_${table.relation}_runtime_id_guard`);
      assert.equal(guard?.enabled, 'O');
      assert.match(
        guard.definition,
        /BEFORE UPDATE OF id .* FOR EACH STATEMENT .*CURRENT_USER.*interdomestik_runtime_rls.*sponsor_reject_update_fn\(\)/iu
      );
    }
  }
}

const state = (code: string) => (error: unknown) =>
  (error as { code?: string } | null)?.code === code;

async function asRuntime(
  client: ScratchClient,
  tenant: string | null,
  work: (tx: postgres.TransactionSql) => Promise<void>
) {
  await client.begin(async tx => {
    await tx`set local role ${tx(sponsorRuntimeRole)}`;
    if (tenant)
      await tx`select set_config('app.current_tenant_id', ${tenant}, true),
      set_config('app.current_access_tenant_id', ${tenant}, true)`;
    await work(tx);
  });
}

export async function proveSponsorRuntimeDenials(client: ScratchClient, a: Scope, b: Scope) {
  await runSequentially([null, b.tenant], async tenant => {
    await asRuntime(client, tenant, async tx => {
      const locked = await tx`select id from sponsors where id = ${a.sponsors} for update`;
      assert.equal(locked.length, 0);
      const updated = await tx`update sponsor_mail_outbox set attempts = 1
        where id = ${a.sponsor_mail_outbox} returning id`;
      assert.equal(updated.length, 0);
      await assert.rejects(
        tx.savepoint(sp => insert(sp, 'sponsors', row(a, 'sponsors', true))),
        state('42501')
      );
    });
  });

  // Read dependencies for the two non-sponsor locks belong to WP-15. This transaction uses
  // scratch-only read ACLs to exercise the 0110 trigger behavior without a release ACL manifest.
  const claim = uid();
  const evidence = uid();
  await client`insert into claim (id, tenant_id, "userId", title, category, "companyName", case_lifecycle_state)
    values (${claim}, ${a.tenant}, ${a.user}, 'Test', 'vehicle', 'Test', 'submitted')`;
  await client`insert into claim_transition_evidence (id, tenant_id, claim_id, evidence_type, evidence_status)
    values (${evidence}, ${a.tenant}, ${claim}, 'human_review', 'reviewed')`;
  await client`grant select (id) on membership_plans, claim_transition_evidence to ${client(sponsorRuntimeRole)}`;
  await asRuntime(client, a.tenant, async tx => {
    const guardedRows = [
      ['sponsors', a.sponsors],
      ['membership_plans', a.plan],
      ['claim_transition_evidence', evidence],
    ];
    await runSequentially(guardedRows, async ([relation, identifier]) => {
      const lock = relation === 'membership_plans' ? 'for share' : 'for update';
      const rows =
        await tx`select id from ${tx(relation)} where id = ${identifier} ${tx.unsafe(lock)}`;
      assert.equal(rows.length, 1, relation);
      await assert.rejects(
        tx.savepoint(sp => sp`update ${sp(relation)} set id = 'another' where id = ${identifier}`),
        state('23514')
      );
      await assert.rejects(
        tx.savepoint(sp => sp`update ${sp(relation)} set id = id where id = ${identifier}`),
        state('23514')
      );
      await assert.rejects(
        tx.savepoint(sp => sp`update ${sp(relation)} set id = id where false`),
        state('23514')
      );
    });
    const denied = [
      'select billing_contact_email from sponsors',
      'select invoice_reference from sponsor_revision_decisions',
      'select evidence_ref from sponsor_handover_cancel_attempts',
      'update sponsor_term_revisions set contract_reference = null where false',
      'update sponsor_revision_decisions set decision = null where false',
      ...TABLES.flatMap(relation => [
        `delete from ${relation} where false`,
        `truncate ${relation}`,
      ]),
    ];
    await runSequentially(denied, async statement => {
      await assert.rejects(
        tx.savepoint(sp => sp.unsafe(statement)),
        state('42501'),
        statement
      );
    });
  });
  await client`alter table sponsors add column future_wp16_test text`;
  await asRuntime(client, a.tenant, async tx => {
    await assert.rejects(
      tx.savepoint(sp =>
        insert(sp, 'sponsors', {
          ...row(a, 'sponsors', true),
          future_wp16_test: 'synthetic',
        })
      ),
      state('42501')
    );
  });
}
