import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CALLBACK_PLAN_SHA256 } from '../../src/migration-callback-plan-manifest';
import { runMigrationRuntimeRoleFixture } from '../migration-runtime-role-fixture.support';
import {
  testRuntimeRoleContainer,
  type RuntimeRoleLifecycleOps,
} from '../migration-runtime-role-lifecycle.support';

test('runs the canonical kernel only as migration owner and emits a redacted manifest', async () => {
  const result = await runMigrationRuntimeRoleFixture(new AbortController().signal);
  assert.equal(result.first.ok, true);
  assert.equal(result.second.ok, true);
  if (!result.first.ok || !result.second.ok) return;
  for (const run of [result.first, result.second]) {
    assert.equal(run.summary.contract_version, 'canonical_migration_execution_v1');
    assert.equal(run.summary.callback_plan_sha256, CALLBACK_PLAN_SHA256);
    assert.equal(run.summary.applied_total, 93);
    assert.equal(run.summary.session_reserved, true);
    assert.equal(run.summary.transaction_committed, true);
    assert.equal(run.summary.session_lock_released, true);
    assert.equal(run.summary.execution_completed, true);
  }
  assert.equal(result.first.summary.applied_before, 0);
  assert.equal(result.first.summary.applied_now, 93);
  assert.equal(result.second.summary.applied_before, 93);
  assert.equal(result.second.summary.applied_now, 0);
  assert.equal(result.runtimePreflightCode, 'ADMIN_DB_PREFLIGHT_ROLE_REJECTED');
  assert.equal(result.runtimeCallbackCount, 0);
  // prettier-ignore
  assert.deepEqual(result.manifest,{contract_version:'migration_runtime_role_manifest_v1',server_major:16,migration_owner_safe:true,runtime_role_safe:true,owner_classes:{database:true,schema:true,relation:true,sequence:true,function:true,type:true},runtime_membership_paths:0,runtime_owned_objects:0,privileges:{public_database_connect:true,public_database_create:false,public_database_temp:true,runtime_database_connect:true,runtime_database_create:false,runtime_database_temp:true,public_schema_usage:false,runtime_schema_usage:false,public_relation_select:false,runtime_relation_select:false,runtime_relation_dml:false,public_sequence_usage:false,public_sequence_select:false,public_sequence_update:false,runtime_sequence_usage:false,runtime_sequence_select:false,runtime_sequence_update:false,public_function_execute:true,runtime_function_execute:true,public_type_usage:true,runtime_type_usage:true},public_create_on_public:false,runtime_create_on_public:false,default_acl_rows:0,default_acl_engine_defaults:true,redacted:true});
  assert.deepEqual(result.cleanup, {
    bootstrap_sessions_absent: true,
    owner_sessions_absent: true,
    rejected_runtime_sessions_absent: true,
    container_removed: true,
    receipt_removed: true,
  });
});

// prettier-ignore
type Scenario = 'planned'|'start'|'lost-create'|'unresolved-create'|'upgrade'|'cleanup'|'cleanup-absent'|'label'|'name'|'port';
function lifecycleOps(scenario: Scenario) {
  const id = 'a'.repeat(64),
    name = `ida-p0a2a-${'b'.repeat(16)}`;
  const receipts: object[] = [],
    removals: string[][] = [],
    calls: string[] = [];
  let exists = false,
    retained = false;
  const missing = () => Object.assign(new Error('redacted'), { stderr: 'error: no such object' });
  const ops: RuntimeRoleLifecycleOps = {
    suffix: () => 'b'.repeat(16),
    persist: async (_path, value) => {
      const state = String((value as { state?: unknown }).state);
      receipts.push(value);
      if (scenario === 'planned' && state === 'planned') throw new Error(`raw ${name}`);
      if (scenario === 'upgrade' && state === 'created') throw new Error(`raw ${name}`);
      retained = true;
    },
    discard: async () => {
      retained = false;
    },
    docker: async args => {
      calls.push(args[0]!);
      if (args[0] === 'create') {
        if (scenario === 'unresolved-create') throw new Error(`raw ${name}`);
        exists = true;
        if (scenario === 'lost-create') throw new Error(`raw ${name}`);
        return id;
      }
      if (args[0] === 'inspect') {
        if (!exists) throw missing();
        const inspectedName = scenario === 'name' ? `${name}-wrong` : name;
        const slice = scenario === 'label' ? 'WRONG' : 'IDA-UI03a2-P0a2a';
        return `${id} /${inspectedName} ${slice} migration-runtime-role-fixture`;
      }
      if (args[0] === 'start') {
        if (scenario === 'start') throw new Error(`raw ${name}`);
        return id;
      }
      if (args[0] === 'port') return scenario === 'port' ? 'invalid' : '127.0.0.1:54321';
      if (args[0] === 'rm') {
        removals.push(args);
        if (scenario === 'cleanup-absent') {
          exists = false;
          throw new Error(`raw ${name}`);
        }
        if (scenario === 'cleanup') throw new Error(`raw ${name}`);
        exists = false;
        return id;
      }
      throw new Error('UNEXPECTED_FAKE_DOCKER_COMMAND');
    },
  };
  return { ops, receipts, removals, calls, id, name, retained: () => retained };
}

test('fails closed and reconciles only exact identity on every lifecycle branch', async () => {
  // prettier-ignore
  const run=(ops:RuntimeRoleLifecycleOps,operation:(port:number)=>Promise<unknown>=async()=>true,signal=new AbortController().signal)=>testRuntimeRoleContainer(signal,operation,ops);
  // prettier-ignore
  const rejects=(promise:Promise<unknown>,code:string)=>assert.rejects(promise,(error:Error)=>error.message===code);
  const planned = lifecycleOps('planned');
  await rejects(run(planned.ops), 'CONTAINER_RECEIPT_WRITE_FAILED');
  assert.deepEqual(planned.calls, []);
  // prettier-ignore
  for (const [scenario, code, retained] of [
    ['start', 'CONTAINER_OPERATION_FAILED', false],
    ['lost-create', 'CONTAINER_CREATE_FAILED', false],
    ['unresolved-create', 'CONTAINER_IDENTITY_UNRESOLVED', true],
    ['upgrade', 'CONTAINER_RECEIPT_WRITE_FAILED', false],
    ['cleanup', 'CONTAINER_CLEANUP_FAILED', true],
    ['label', 'CONTAINER_IDENTITY_UNRESOLVED', true],
    ['name', 'CONTAINER_IDENTITY_UNRESOLVED', false],
    ['port', 'CONTAINER_PORT_REJECTED', false],
  ] as const) {
    const fixture = lifecycleOps(scenario);
    await rejects(run(fixture.ops), code);
    assert.equal(fixture.retained(), retained);
    if (scenario === 'lost-create')
      assert.deepEqual(fixture.receipts, [
        { state: 'planned', name: fixture.name, labels: { 'com.interdomestik.slice': 'IDA-UI03a2-P0a2a', 'com.interdomestik.owner': 'migration-runtime-role-fixture' } },
        { state: 'created', id: fixture.id, name: fixture.name, labels: { 'com.interdomestik.slice': 'IDA-UI03a2-P0a2a', 'com.interdomestik.owner': 'migration-runtime-role-fixture' } },
      ]);
    for (const removal of fixture.removals)
      assert.deepEqual(removal, ['rm', '--force', 'a'.repeat(64)]);
  }
  const absent = lifecycleOps('cleanup-absent');
  const cleaned = await run(absent.ops);
  assert.deepEqual(cleaned.cleanup, { container_removed: true, receipt_removed: true });
  assert.equal(absent.retained(), false);
  const raw = lifecycleOps('start');
  // prettier-ignore
  await rejects(run({...raw.ops,docker:async args=>(args[0]==='start'?'ok':raw.ops.docker(args))},async()=>{throw new Error('postgresql://dynamic-secret');}),'CONTAINER_OPERATION_FAILED');
  const abort = lifecycleOps('start'),
    controller = new AbortController();
  // prettier-ignore
  await rejects(run({...abort.ops,docker:async args=>(args[0]==='start'?'ok':abort.ops.docker(args))},async()=>{controller.abort();return true;},controller.signal),'CONTAINER_ABORTED');
});
