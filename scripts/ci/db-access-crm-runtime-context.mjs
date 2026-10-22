import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
// Install Node's real ALS before importing Next. No package/function replacement.
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
export async function runActionContext(action) {
  const { workAsyncStorage } =
    await import('next/dist/server/app-render/work-async-storage.external.js');
  const { workUnitAsyncStorage } =
    await import('next/dist/server/app-render/work-unit-async-storage.external.js');
  const store = { route: '/owned-crm-runtime', incrementalCache: {}, pendingRevalidatedTags: [] };
  const result = await workAsyncStorage.run(store, () =>
    workUnitAsyncStorage.run({ type: 'request', phase: 'action' }, action)
  );
  return { result, tags: store.pendingRevalidatedTags.map((item) => item.tag) };
}
export async function assertContextClear(runtime) {
  const { sql } = await import('drizzle-orm');
  const rows = await runtime.db.execute(
    sql.raw(
      "SELECT current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_access_tenant_id',true) AS access"
    )
  );
  assert.ok(!rows[0].tenant && !rows[0].access);
  await runtime.assertRlsConnectionRoleReady();
}
