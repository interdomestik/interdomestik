// Pure metadata predicates only; these functions cannot mint fetch/runtime authority.
const fail = message => {
  throw Error('P2 ordinary artifact refused: ' + message);
};
export function verifyOrdinaryProvenance(input) {
  return verifyProvenance(input, false);
}
export function verifyM4C0UnitProvenance(input) {
  return verifyProvenance(input, true);
}
function verifyProvenance({ run, job, artifact, context, runId, attempt }, m4C0) {
  if (!Number.isSafeInteger(runId) || runId <= 0 || !Number.isSafeInteger(attempt) || attempt <= 0)
    fail('run identity');
  if (
    run.id !== runId ||
    run.run_attempt !== attempt ||
    run.event !== context.eventName ||
    !['in_progress', 'completed'].includes(run.status) ||
    (run.status === 'completed' &&
      run.conclusion !== 'success' &&
      !(m4C0 && run.conclusion === 'failure')) ||
    run.path !== '.github/workflows/ci.yml' ||
    run.repository?.full_name !== 'interdomestik/interdomestik' ||
    run.head_repository?.full_name !== 'interdomestik/interdomestik' ||
    run.head_sha !== context.headCommit
  )
    fail('canonical completed ordinary workflow');
  if (
    job.run_id !== runId ||
    job.run_attempt !== attempt ||
    job.name !== 'unit' ||
    job.status !== 'completed' ||
    job.conclusion !== 'success'
  )
    fail('canonical ordinary job');
  const name = 'ordinary-coverage-' + attempt + '-' + context.candidateCommit;
  if (
    !Number.isSafeInteger(artifact.id) ||
    artifact.id <= 0 ||
    !Number.isFinite(Date.parse(artifact.created_at)) ||
    !Number.isFinite(Date.parse(run.run_started_at)) ||
    artifact.name !== name ||
    artifact.expired !== false ||
    artifact.workflow_run?.id !== runId ||
    artifact.workflow_run?.head_sha !== run.head_sha ||
    !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest) ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes <= 0 ||
    artifact.size_in_bytes > 32 * 1024 * 1024 ||
    Date.parse(artifact.created_at) < Date.parse(run.run_started_at)
  )
    fail('artifact provenance');
  return { artifactId: artifact.id, artifactName: name, digest: artifact.digest };
}
