const REPOSITORY = 'interdomestik/interdomestik';
const REPOSITORY_ID = 1128472973;
const SHA = /^[a-f0-9]{40}$/u;
// GitHub preserves this unevaluated name for jobs skipped before runner allocation.
const DEFERRED_DELIVERY_NAME =
  "github.event.pull_request.base.ref == 'main' && github.event.pull_request.state == 'open' && !github.event.pull_request.draft && (github.event.action != 'labeled' || github.event.label.name == 'full-gate') && 'delivery-gate' || 'delivery-gate-deferred'";
const MARKER =
  /^feedback-snapshot:v1:([1-9]\d*):([a-f0-9]{40}):([a-f0-9]{40}):([a-f0-9]{40}):([a-f0-9]{64})$/u;
const WORKFLOWS = {
  '.github/workflows/pr-delivery-gate.yml': {
    context: 'delivery-gate',
    title: 'PR delivery gate',
  },
  '.github/workflows/pr-finalizer.yml': {
    context: 'pr-finalizer',
    title: 'PR finalizer',
  },
};
const finished = value =>
  value?.status === 'completed' && ['success', 'failure'].includes(value.conclusion);
const sameRepository = value => value?.id === REPOSITORY_ID && value.full_name === REPOSITORY;
const positive = value => Number.isSafeInteger(value) && value > 0;

export function eligiblePull(pull) {
  return (
    positive(pull?.number) &&
    pull.state === 'open' &&
    pull.draft === false &&
    pull.base?.ref === 'main' &&
    sameRepository(pull.base.repo) &&
    sameRepository(pull.head?.repo) &&
    SHA.test(pull.base.sha) &&
    SHA.test(pull.head.sha) &&
    SHA.test(pull.merge_commit_sha)
  );
}

export function parseFeedbackMarker(name) {
  const match = typeof name === 'string' && MARKER.exec(name);
  if (!match || !positive(Number(match[1]))) return null;
  return {
    number: Number(match[1]),
    base: match[2],
    head: match[3],
    testedMerge: match[4],
    digest: match[5],
  };
}

export function sameFeedbackIdentity(left, right) {
  return ['number', 'base', 'head', 'testedMerge'].every(key => left?.[key] === right?.[key]);
}

export function isDeferredLabel(pull, workflow, run, jobs) {
  const rule = WORKFLOWS[workflow?.path];
  if (
    !eligiblePull(pull) ||
    !rule ||
    !positive(run?.id) ||
    !positive(run.run_attempt) ||
    run.status !== 'completed' ||
    run.event !== 'pull_request' ||
    run.workflow_id !== workflow.id ||
    run.path !== workflow.path ||
    run.head_sha !== pull.head.sha ||
    run.head_branch !== pull.head.ref ||
    !sameRepository(run.repository) ||
    !sameRepository(run.head_repository) ||
    !positive(run.actor?.id) ||
    !['User', 'Bot'].includes(run.actor.type) ||
    !run.actor.login ||
    run.display_title !== `${rule.title} [supersession:v1:pull_request:labeled:${pull.head.sha}]` ||
    !Array.isArray(run.pull_requests) ||
    run.pull_requests.some(item => item.number !== pull.number) ||
    jobs.length !== 1
  )
    return false;
  const job = jobs[0];
  if (
    !positive(job.id) ||
    job.run_id !== run.id ||
    job.run_attempt !== run.run_attempt ||
    job.status !== 'completed' ||
    !Array.isArray(job.steps)
  )
    return false;
  if (rule.context === 'delivery-gate')
    return (
      run.conclusion === 'skipped' &&
      ['delivery-gate-deferred', DEFERRED_DELIVERY_NAME].includes(job.name) &&
      job.conclusion === 'skipped' &&
      job.steps.every(step => step.status === 'completed' && step.conclusion === 'skipped')
    );
  if (run.conclusion !== 'success' || job.conclusion !== 'success' || job.name !== rule.context)
    return false;
  const required = [
    'Run actions/checkout@v5',
    'Evaluate PR gate policy',
    'Resolve exact-head certification admission',
    'Report quick draft lane',
    'Node setup',
    'Run PR finalizer gate',
  ];
  const optional = ['Set up job', 'Post Run actions/checkout@v5', 'Complete job'];
  const steps = job.steps.filter(step => !optional.includes(step.name));
  return (
    steps.length === required.length &&
    steps.every(
      (step, i) =>
        step.name === required[i] &&
        step.status === 'completed' &&
        step.conclusion === (i < 4 ? 'success' : 'skipped')
    ) &&
    job.steps
      .filter(step => optional.includes(step.name))
      .every(step => step.status === 'completed' && step.conclusion === 'success')
  );
}

export function planRefresh({ pull, workflow, run, jobs, permission, feedback, now }) {
  const rule = WORKFLOWS[workflow?.path];
  if (!eligiblePull(pull) || !rule || workflow.state !== 'active' || !positive(workflow.id))
    return null;
  const identity = {
    number: pull.number,
    base: pull.base.sha,
    head: pull.head.sha,
    testedMerge: pull.merge_commit_sha,
  };
  if (!sameFeedbackIdentity(identity, feedback) || !/^[a-f0-9]{64}$/u.test(feedback.digest))
    return null;
  const age = now - Date.parse(run?.created_at);
  if (!Number.isFinite(age) || age < 0 || age >= 29 * 24 * 60 * 60 * 1000) return null;
  if (
    !positive(run.id) ||
    !positive(run.run_attempt) ||
    run.run_attempt >= 50 ||
    !finished(run) ||
    run.workflow_id !== workflow.id ||
    run.path !== workflow.path ||
    run.event !== 'pull_request' ||
    run.head_sha !== identity.head ||
    run.head_branch !== pull.head.ref ||
    !sameRepository(run.repository) ||
    !sameRepository(run.head_repository)
  )
    return null;
  const titles = ['opened', 'synchronize', 'reopened', 'ready_for_review', 'labeled'].map(
    action => `${rule.title} [supersession:v1:pull_request:${action}:${identity.head}]`
  );
  if (
    !titles.includes(run.display_title) ||
    !Array.isArray(run.pull_requests) ||
    run.pull_requests.some(item => item.number !== identity.number)
  )
    return null;
  const actor = run.actor;
  if (
    actor?.type !== 'User' ||
    !positive(actor.id) ||
    !/^[a-z0-9-]{1,39}$/iu.test(actor.login) ||
    permission?.user?.id !== actor.id ||
    permission.user.login !== actor.login ||
    permission.user.type !== 'User' ||
    !['write', 'maintain', 'admin'].includes(permission.permission)
  )
    return null;
  if (!Array.isArray(jobs) || jobs.length !== 1) return null;
  const job = jobs[0];
  if (
    !positive(job.id) ||
    job.run_id !== run.id ||
    job.run_attempt !== run.run_attempt ||
    job.name !== rule.context ||
    job.status !== 'completed' ||
    !Array.isArray(job.steps)
  )
    return null;
  const markers = job.steps.filter(step => step.name?.startsWith('feedback-snapshot:'));
  const setup = job.steps.filter(step => step.name === 'Node setup');
  if (
    markers.length !== 1 ||
    setup.length !== 1 ||
    setup[0].status !== 'completed' ||
    setup[0].conclusion !== 'success' ||
    !finished(markers[0]) ||
    !positive(markers[0].number) ||
    !positive(setup[0].number) ||
    setup[0].number >= markers[0].number
  )
    return null;
  const previous = parseFeedbackMarker(markers[0].name);
  if (!previous || !sameFeedbackIdentity(previous, identity) || previous.digest === feedback.digest)
    return null;
  return { runId: run.id, runAttempt: run.run_attempt, context: rule.context };
}
