// Fixed restricted-child owner. No provisioning connection or caller-supplied factory enters here.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const api = createRequire(import.meta.url)('./m4-runtime.cjs');
const owned = new WeakMap();
const caseIds = Object.freeze({
  'legacy-admin': 'mounted-admin-assignment-source-route',
  'legacy-agent': 'mounted-agent-assignment-source-route',
  staff: 'mounted-staff-assignment-source-route',
});
const usedCases = new Set();
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let adapterActive = false;
const fail = () => {
  throw Error('M4 mounted fixture refused');
};

export async function createM4MountedFixtureRuntime(runtimeId, configuration, tls) {
  if (
    !tls ||
    Object.keys(tls).sort().join('|') !== 'ca|cert|key' ||
    ['ca', 'cert', 'key'].some(key => typeof tls[key] !== 'string' || tls[key].length > 16384) ||
    tls.ca !== tls.cert
  )
    fail();
  const owner = await api.startM4LocalQualificationAssignmentOwner({
    runtime: configuration,
    tls: { key: tls.key, cert: tls.cert },
    host: '127.0.0.1',
    port: 0,
    relayDeadlineMs: Math.max(12000, configuration.operationDeadlineMs + 2000),
  });
  const entry = {
    runtimeId,
    owner,
    cases: [],
    taken: false,
    closed: false,
    drained: false,
    closing: undefined,
    adapterWork: new Set(),
  };
  const facade = Object.freeze({
    close() {
      entry.closed = true;
      if (!entry.closing)
        entry.closing = (async () => {
          let stopping;
          try {
            stopping = owner.close();
          } catch {
            stopping = Promise.reject(Error('M4 mounted owner close failed'));
          }
          const results = await Promise.allSettled([stopping, ...entry.adapterWork]);
          if (results.some(row => row.status === 'rejected')) fail();
          entry.drained = true;
        })();
      return entry.closing;
    },
    execute: (...args) => owner.execute(...args),
    executeLegacyAdmin: (...args) => owner.executeLegacyAdmin(...args),
    executeLegacyAgent: (...args) => owner.executeLegacyAgent(...args),
    executeStaff: (...args) => owner.executeStaff(...args),
  });
  owned.set(facade, entry);
  return facade;
}

export function invokeM4MountedFixtureAdapter(runtime, profile, input) {
  const entry = owned.get(runtime),
    caseId =
      typeof profile === 'string' && Object.hasOwn(caseIds, profile) ? caseIds[profile] : null;
  if (
    !entry ||
    entry.closed ||
    !caseId ||
    usedCases.has(caseId) ||
    adapterActive ||
    !input ||
    Object.keys(input).some(
      key => !['claimId', 'staffId', 'operationId', 'cookie'].includes(key)
    ) ||
    typeof input.claimId !== 'string' ||
    typeof input.operationId !== 'string' ||
    typeof input.cookie !== 'string' ||
    (Object.hasOwn(input, 'staffId') && input.staffId !== null && typeof input.staffId !== 'string')
  )
    fail();
  adapterActive = true;
  usedCases.add(caseId);
  const work = (async () => {
    const names = [
      'M4_ASSIGNMENT_OWNER_ORIGIN',
      'M4_ASSIGNMENT_OWNER_CA_FILE',
      'M4_ASSIGNMENT_RELAY_DEADLINE_MS',
    ];
    const previous = names.map(name => process.env[name]);
    const caPath = path.join(process.cwd(), 'results', 'mounted-ca-' + entry.runtimeId + '.pem');
    let caOwned = false;
    try {
      fs.writeFileSync(caPath, entry.owner.clientConfiguration.ca, { flag: 'wx', mode: 0o600 });
      caOwned = true;
      process.env.M4_ASSIGNMENT_OWNER_ORIGIN = entry.owner.origin;
      process.env.M4_ASSIGNMENT_OWNER_CA_FILE = caPath;
      process.env.M4_ASSIGNMENT_RELAY_DEADLINE_MS = String(
        entry.owner.clientConfiguration.deadlineMs
      );
      if (api.takeM4CacheCalls().length) fail();
      const requestHeaders = new Headers({
        cookie: input.cookie,
        'x-forwarded-for': '192.0.2.20',
        'user-agent': 'Synthetic mounted assignment proof',
      });
      const params = {
        claimId: input.claimId,
        operationId: input.operationId,
        requestHeaders,
        ...(Object.hasOwn(input, 'staffId') ? { staffId: input.staffId } : {}),
      };
      const adapter =
        profile === 'legacy-admin'
          ? api.executeMountedM4AdminAdapter
          : profile === 'legacy-agent'
            ? api.executeMountedM4AgentAdapter
            : api.executeMountedM4StaffAdapter;
      const result = await adapter(params);
      const cachePaths = api.takeM4CacheCalls();
      entry.cases.push({
        caseId,
        profile,
        runtimeId: entry.runtimeId,
        operationId: input.operationId,
        wrapperResultDigest: digest(result),
        cachePaths,
      });
      return { result, cachePaths };
    } finally {
      for (const [index, name] of names.entries()) {
        if (previous[index] === undefined) delete process.env[name];
        else process.env[name] = previous[index];
      }
      if (caOwned) fs.unlinkSync(caPath);
      api.takeM4CacheCalls();
      adapterActive = false;
    }
  })().finally(() => entry.adapterWork.delete(work));
  entry.adapterWork.add(work);
  return work;
}

export function takeM4MountedFixtureRuntime(runtime) {
  const entry = owned.get(runtime);
  if (!entry) return undefined;
  if (entry.taken || adapterActive || !entry.closed || !entry.drained || entry.adapterWork.size)
    fail();
  entry.taken = true;
  const owner = api.takeM4OwnedAssignmentOwnerContexts(entry.owner);
  const cases = entry.cases.map(row => {
    const matches = owner.transport.rows.filter(
      candidate => candidate.profile === row.profile && candidate.operationId === row.operationId
    );
    if (matches.length !== 1) fail();
    const actual = matches[0];
    if (
      !/^[a-f0-9]{64}$/.test(actual.requestDigest) ||
      !/^[a-f0-9]{64}$/.test(actual.responseDigest)
    )
      fail();
    return {
      ...row,
      requestDigest: actual.requestDigest,
      responseDigest: actual.responseDigest,
      outcome: actual.outcome,
      delivery: actual.delivery,
      responseProvenance: 'owned-server',
    };
  });
  return { contexts: owner.contexts, owner: { runtimeId: entry.runtimeId, ...owner }, cases };
}
