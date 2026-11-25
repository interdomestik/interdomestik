function unconditional(condition) {
  return (
    condition === undefined ||
    condition === true ||
    (typeof condition === 'string' &&
      condition.replace(/^\$\{\{(.*)\}\}$/u, '$1').trim() === 'true')
  );
}

function jobRuns(jobs, name, expectedCondition, ancestors = new Set()) {
  if (!Object.hasOwn(jobs, name) || ancestors.has(name)) return false;
  const job = jobs[name];
  if (
    !job ||
    !(expectedCondition === undefined ? unconditional(job.if) : job.if === expectedCondition) ||
    job.strategy !== undefined ||
    !Array.isArray(job.steps) ||
    !job.steps.length
  )
    return false;
  const prerequisites = typeof job.needs === 'string' ? [job.needs] : job.needs;
  if (prerequisites === undefined) return true;
  const path = new Set([...ancestors, name]);
  return (
    Array.isArray(prerequisites) &&
    prerequisites.every(
      needed => typeof needed === 'string' && jobRuns(jobs, needed, undefined, path)
    )
  );
}

export function provenWorkflowStep(workflow, jobName, stepName, jobCondition, stepCondition) {
  const { jobs } = workflow;
  if (!jobs || workflow.defaults !== undefined || !jobRuns(jobs, jobName, jobCondition))
    return undefined;
  const job = jobs[jobName];
  if (job.defaults !== undefined || job['continue-on-error']) return undefined;
  const steps = job.steps.filter(step => step?.name === stepName);
  if (steps.length !== 1) return undefined;
  const [step] = steps;
  if (
    !(stepCondition === undefined ? unconditional(step.if) : step.if === stepCondition) ||
    step['continue-on-error'] ||
    step['working-directory'] !== undefined ||
    step.shell !== undefined
  )
    return undefined;
  return step;
}
