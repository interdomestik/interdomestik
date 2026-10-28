import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// The application module below is an explicit test double. This exercises the real fixed
// child/client IPC only; neither its result nor its constructor names are runtime evidence.
const model = `
const owners=new WeakSet(),runtimes=new WeakMap();
export async function startM4ObservedPrivateAssignmentOwner(){
 const owner=Object.freeze({origin:'https://127.0.0.1:44444',close:async()=>{}});
 owners.add(owner);return owner;
}
export function takeM4StrictAssignmentOwnerContexts(owner){
 if(!owners.delete(owner))throw Error('owner used');
 return {constructorName:'startM4PrivateAssignmentOwner',contexts:{rows:[]},transport:{rows:[]}};
}
export function createM4ObservedPrivateAssignmentRuntime(configuration){
 const rows=[];let closed=false;
 const runtime=Object.freeze({
  execute:async(cookie,serialized)=>{
   if(closed||cookie!=='unit-cookie'||configuration.marker!=='unit-only')throw Error('bad unit input');
   const request=JSON.parse(serialized);rows.push({profile:'ops',operationId:request.operationId});
   return {status:'completed',operationId:request.operationId,result:{success:true}};
  },
  close:async()=>{closed=true;},
 });
 runtimes.set(runtime,{rows,closed:()=>closed});return runtime;
}
export function takeM4StrictAssignmentContexts(runtime){
 const state=runtimes.get(runtime);
 if(!state||!state.closed())throw Error('not closed');
 runtimes.delete(runtime);return {constructorName:'createM4PrivateAssignmentRuntime',rows:state.rows};
}
`;
test('actual fixed backend IPC permits one separate ops execution and closes both owners', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-ops-channel-')));
  let client;
  try {
    for (const name of [
      'db-access-m4-compiled-backend-child.mjs',
      'db-access-m4-compiled-backend-client.mjs',
    ])
      fs.copyFileSync(new URL('./' + name, import.meta.url), path.join(root, name));
    fs.mkdirSync(path.join(root, 'home'));
    fs.mkdirSync(path.join(root, 'tmp'));
    fs.writeFileSync(path.join(root, 'unit-ca.pem'), '');
    fs.writeFileSync(
      path.join(root, 'db-access-m4-compiled-platform.mjs'),
      'export const m4CompiledBackendLaunch=()=>({caFile:' +
        JSON.stringify(path.join(root, 'unit-ca.pem')) +
        ',tls:{key:"unit",cert:"unit"}});'
    );
    fs.writeFileSync(path.join(root, 'm4-compiled-backend.mjs'), model);
    const { openM4CompiledBackend } = await import(
      pathToFileURL(path.join(root, 'db-access-m4-compiled-backend-client.mjs'))
    );
    client = openM4CompiledBackend(root, {}, performance.now() + 5000);
    client.createProfiles({ marker: 'unit-only' });
    assert.equal(await client.origin(), 'https://127.0.0.1:44444');
    const operationId = '11111111-1111-4111-8111-111111111111';
    const result = await client.executeOps('unit-cookie', JSON.stringify({ operationId }));
    assert.match(result.opsInstanceId, /^[a-f0-9-]{36}$/u);
    assert.deepEqual(result.contexts.rows, [{ profile: 'ops', operationId }]);
    assert.throws(
      () => client.executeOps('unit-cookie', JSON.stringify({ operationId })),
      /One fixed/
    );
    const owner = await client.close();
    assert.match(owner.ownerInstanceId, /^[a-f0-9-]{36}$/u);
    assert.notEqual(owner.ownerInstanceId, result.opsInstanceId);
    assert.equal(owner.constructorName, 'startM4PrivateAssignmentOwner');
    assert.deepEqual(await client.close(), owner);
  } finally {
    await client?.close().catch(() => {});
    fs.rmSync(root, { recursive: true });
  }
});
