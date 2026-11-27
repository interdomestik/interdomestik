import assert from 'node:assert/strict';
import { runSequentially } from './in-order';
import type { ScratchClient } from './pg16/scratch-database';

export const compareNames = (left: string, right: string) =>
  Number(left > right) - Number(left < right);

export async function assertInboundFunctionGrants(admin: ScratchClient, role: string) {
  const guard = 'interdomestik_wp12_guard';
  const receiptWriter = 'interdomestik_wp12_receipt_writer';
  const verifier = 'interdomestik_wp12_verifier';
  const appRole = 'interdomestik_runtime_rls';
  const [app] = await admin`select 1 from pg_roles where rolname = ${appRole}`;
  const runtimeRoles = app ? [role, appRole] : [role];
  const actorGuards = [
    'claim_inbound_decision_actor_scope_guard_fn()',
    'claim_received_document_actor_scope_guard_fn()',
  ];
  const expectedGrants: Record<string, readonly string[]> = {
    'claim_inbound_reserved_path(text)': [...runtimeRoles, guard],
    'claim_inbound_staff_branch_allowed(text,text)': runtimeRoles,
    'claim_inbound_lock_staff_branch(text,text)': [receiptWriter],
    'claim_inbound_decision_visible(text,text,text,text,text,text,varchar,varchar)': [
      ...runtimeRoles,
      guard,
      receiptWriter,
    ],
    'claim_inbound_decision_deadline(timestamptz)': [...runtimeRoles, receiptWriter],
    'record_claim_inbound_object_verification(uuid,text,text,integer,text)': [verifier],
    'claim_inbound_enrollment_guard_fn()': [],
    'claim_inbound_document_home_guard_fn()': [],
    'claim_inbound_decision_guard_fn()': [],
    'claim_inbound_document_publication_guard_fn()': [],
    'claim_inbound_staff_scope_guard_fn()': [],
    'claim_inbound_document_scope_guard_fn()': [],
    'claim_inbound_polymorphic_guard_fn()': [],
    'claim_inbound_owner_guard_fn()': [],
    'claim_received_seal_guard_fn()': [],
    'claim_received_document_guard_fn()': [],
    'claim_received_set_count_fn()': [],
    ...Object.fromEntries(actorGuards.map(signature => [signature, []])),
  };
  await runSequentially(Object.entries(expectedGrants), async ([signature, grantees]) => {
    const qualified = `public.${signature}`;
    const [posture] = await admin<
      {
        runtime_execute: boolean;
        grantees: string[];
        owner: string;
        security_definer: boolean;
        search_path: string[] | null;
      }[]
    >`select
      has_function_privilege(${role}, p.oid, 'EXECUTE') as runtime_execute,
      p.proowner::regrole::text as owner, p.prosecdef as security_definer,
      (select pg_catalog.regexp_split_to_array(option_value, '[[:space:]]*,[[:space:]]*')
        from pg_catalog.pg_options_to_table(p.proconfig)
        where option_name = 'search_path') as search_path,
      array(select coalesce(r.rolname::text, 'PUBLIC') || case when acl.is_grantable then '*' else '' end
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
        left join pg_roles as r on r.oid = acl.grantee
        where acl.grantee <> p.proowner and acl.privilege_type = 'EXECUTE') as grantees
      from pg_proc as p where p.oid = ${qualified}::regprocedure`;
    posture.grantees.sort(compareNames);
    assert.deepEqual(posture.grantees, [...grantees].sort(compareNames), signature);
    assert.equal(posture.runtime_execute, grantees.includes(role), signature);
    if (actorGuards.includes(signature)) {
      assert.equal(posture.owner, guard, signature);
      assert.equal(posture.security_definer, true, signature);
      assert.deepEqual(posture.search_path, ['pg_catalog', 'pg_temp'], signature);
    }
  });
}
