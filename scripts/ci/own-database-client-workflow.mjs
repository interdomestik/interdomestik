// CHK-13 (R-13): the promise of the one owner operation's workflow, read as text: dispatched
// only, invoked by one job alone on its own command line, main-only and in the staging environment.

// The keys directly under a workflow's top-level `on:`.
function workflowTriggers(workflow) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trimEnd() === 'on:');
  if (start < 0) return [];
  const triggers = [];
  for (const line of lines.slice(start + 1)) {
    const content = line.trim();
    if (content === '' || content.startsWith('#')) continue;
    if (!line.startsWith(' ')) break;
    if (line.startsWith('  ') && line[2] !== ' ') triggers.push(content);
  }
  return triggers;
}

// The jobs of a workflow, each with its lines, from its two-space key to the next.
function workflowJobs(workflow) {
  const lines = workflow.split('\n');
  const jobs = new Map();
  let current;
  for (const line of lines.slice(lines.findIndex(text => text.trimEnd() === 'jobs:') + 1)) {
    if (/^\S/u.test(line)) break;
    const key = /^ {2}([\w-]+):\s*$/u.exec(line);
    if (key) {
      current = key[1];
      jobs.set(current, []);
    } else if (current) jobs.get(current).push(line);
  }
  return jobs;
}

const OWNER_JOB_CONDITION =
  "    if: ${{ github.repository == 'interdomestik/interdomestik' && github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' }}";

/** What is wrong with the owner workflow for `pinned`; empty means it keeps its promise. */
export function ownerWorkflowProblems(workflow, pinned) {
  const problems = [];
  if (JSON.stringify(workflowTriggers(workflow)) !== '["workflow_dispatch:"]') {
    problems.push('the trigger is not workflow_dispatch alone');
  }
  if (!workflow.includes(pinned.operation)) problems.push(`it does not name ${pinned.operation}`);
  // A command line of its own: `run: node <path>`, or `node <path>` inside a run block; never text
  // after another command or a comment.
  const path = pinned.path.replaceAll('.', String.raw`\.`);
  const invocation = new RegExp(String.raw`^\s*(?:-\s+)?(?:run:\s+)?node ${path}(?:\s|$)`, 'u');
  const invoking = [...workflowJobs(workflow)].filter(([, lines]) =>
    lines.some(line => invocation.test(line))
  );
  if (invoking.length !== 1 || invoking[0][0] !== pinned.job) {
    return [...problems, `the operation is not invoked by job ${pinned.job} alone`];
  }
  const own = invoking[0][1].filter(line => /^ {4}\S/u.test(line) || /^ {6}name:/u.test(line));
  if (!own.includes(OWNER_JOB_CONDITION)) problems.push('the job is not main-only and dispatched');
  const environment = own.indexOf('    environment:');
  if (environment < 0 || own[environment + 1] !== '      name: staging') {
    problems.push('the job does not run in the staging environment');
  }
  return problems;
}
