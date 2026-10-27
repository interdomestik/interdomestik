// Closed report-shape validation only; this never creates runtime or native authority.
const paths = Object.freeze({
  ops: '/m4/assignment/ops',
  'legacy-admin': '/m4/assignment/legacy-admin',
  'legacy-agent': '/m4/assignment/legacy-agent',
  staff: '/m4/assignment/staff',
});
const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
const ids = [
  'mounted-admin-assignment-source-route',
  'mounted-agent-assignment-source-route',
  'mounted-staff-assignment-source-route',
];
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const uuid = value =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const keys = (value, expected) =>
  value &&
  typeof value === 'object' &&
  Object.keys(value).sort().join('|') === expected.split('|').sort().join('|');
const fail = () => {
  throw Error('M4 runtime result refused: mounted assignment completion');
};

export function validateM4MountedCompletion(report, contexts, contract) {
  const mounted = report.mountedAssignments;
  if (
    !keys(mounted, 'version|owners|cases') ||
    mounted.version !== 1 ||
    !Array.isArray(mounted.owners) ||
    !mounted.owners.length ||
    mounted.owners.length > contexts.closed ||
    !Array.isArray(mounted.cases) ||
    JSON.stringify(contract.caseIDs.mounted) !== JSON.stringify(ids) ||
    mounted.cases.length !== 3
  )
    fail();
  const owners = new Map();
  let transportRows = 0;
  for (const owner of mounted.owners) {
    if (
      !keys(owner, 'version|runtimeId|localQualificationOnly|contexts|transport') ||
      owner.version !== 1 ||
      owner.localQualificationOnly !== true ||
      !Number.isSafeInteger(owner.runtimeId) ||
      owners.has(owner.runtimeId) ||
      !keys(owner.transport, 'rows') ||
      !Array.isArray(owner.transport.rows) ||
      owner.transport.rows.length > 128
    )
      fail();
    const original = contexts.assignmentContexts.find(row => row.runtimeId === owner.runtimeId);
    if (!original) fail();
    const { runtimeId, ...construction } = original;
    if (JSON.stringify(owner.contexts) !== JSON.stringify(construction)) fail();
    for (const row of owner.transport.rows) {
      if (
        !keys(row, 'profile|path|operationId|requestDigest|responseDigest|outcome|delivery') ||
        !Object.hasOwn(paths, row.profile) ||
        row.path !== paths[row.profile] ||
        !uuid(row.operationId) ||
        !hash(row.requestDigest) ||
        !(row.responseDigest === null || hash(row.responseDigest)) ||
        !['completed', 'denied', 'indeterminate'].includes(row.outcome) ||
        !['pending', 'finished', 'closed', 'failed'].includes(row.delivery)
      )
        fail();
      transportRows++;
    }
    owners.set(runtimeId, owner);
  }
  if (transportRows > 2048) fail();
  const selectedOwners = new Set(),
    operationIds = new Set();
  for (const [index, row] of mounted.cases.entries()) {
    if (
      !keys(
        row,
        'caseId|profile|runtimeId|operationId|requestDigest|responseDigest|outcome|delivery|wrapperResultDigest|cachePaths|responseProvenance'
      ) ||
      row.caseId !== ids[index] ||
      row.profile !== profiles[index] ||
      !Number.isSafeInteger(row.runtimeId) ||
      selectedOwners.has(row.runtimeId) ||
      !owners.has(row.runtimeId) ||
      !uuid(row.operationId) ||
      operationIds.has(row.operationId) ||
      !hash(row.requestDigest) ||
      !hash(row.responseDigest) ||
      !hash(row.wrapperResultDigest) ||
      row.outcome !== 'completed' ||
      row.delivery !== 'finished' ||
      row.responseProvenance !== 'owned-server' ||
      !Array.isArray(row.cachePaths) ||
      row.cachePaths.length !== (row.profile === 'staff' ? 8 : 24) ||
      row.cachePaths.some(value => typeof value !== 'string' || value.length > 512)
    )
      fail();
    selectedOwners.add(row.runtimeId);
    operationIds.add(row.operationId);
    const matching = owners
      .get(row.runtimeId)
      .transport.rows.filter(
        candidate =>
          candidate.profile === row.profile &&
          candidate.operationId === row.operationId &&
          candidate.requestDigest === row.requestDigest
      );
    if (
      matching.length !== 1 ||
      matching[0].responseDigest !== row.responseDigest ||
      matching[0].outcome !== row.outcome ||
      matching[0].delivery !== row.delivery
    )
      fail();
    const original = contexts.assignmentContexts.find(owner => owner.runtimeId === row.runtimeId);
    if (
      !original.rows.some(
        candidate =>
          candidate.profile === row.profile &&
          candidate.operationId === row.operationId &&
          candidate.requestDigest === row.requestDigest &&
          candidate.responseDigest === row.responseDigest
      )
    )
      fail();
  }
  return Object.freeze({ mountedCaseIds: Object.freeze([...ids]), mountedAssignments: mounted });
}
