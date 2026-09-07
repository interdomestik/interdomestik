import { isDeepStrictEqual } from 'node:util';
import yaml from 'js-yaml';

const MAX_YAML_BYTES = 256 * 1024;
const MAX_YAML_NODES = 10_000;
const MAX_YAML_DEPTH = 64;
const LEVELS = { none: 0, read: 1, write: 2 };
// Explicit scopes only; new scopes and all-access shortcuts require normal review.
// https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
const SCOPES = new Map([
  ...[
    'actions',
    'artifact-metadata',
    'attestations',
    'checks',
    'code-quality',
    'contents',
    'deployments',
    'discussions',
    'issues',
    'packages',
    'pages',
    'pull-requests',
    'security-events',
    'statuses',
  ].map(scope => [scope, ['none', 'read', 'write']]),
  ['id-token', ['none', 'write']],
  ['vulnerability-alerts', ['none', 'read']],
]);

const isMap = value =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const requireKnown = condition => {
  if (!condition) throw new Error('Unsupported workflow permission comparison');
};

function permissionMap(value) {
  requireKnown(isMap(value));
  requireKnown(Object.entries(value).every(([scope, level]) => SCOPES.get(scope)?.includes(level)));
  return value;
}

function parseWorkflow(text) {
  requireKnown(typeof text === 'string' && Buffer.byteLength(text) <= MAX_YAML_BYTES);
  const frames = [];
  let nodes = 0;
  const lexical = yaml.load(text, {
    schema: yaml.FAILSAFE_SCHEMA,
    onWarning: () => requireKnown(false),
    listener(event, state) {
      if (event === 'open') {
        requireKnown(++nodes <= MAX_YAML_NODES && frames.length < MAX_YAML_DEPTH);
        frames.push([]);
        return;
      }
      const children = frames.pop();
      // Refuse directives, tags, anchors/aliases, merge keys and complex keys.
      requireKnown(state.version === null && state.anchor === null);
      requireKnown(Object.keys(state.tagMap ?? {}).length === 0);
      requireKnown(state.tag === null || state.tag === '?');
      const wrapper = children.length === 1 && children[0].result === state.result;
      if (state.kind === 'mapping' && !wrapper) {
        requireKnown(children.length % 2 === 0);
        for (let index = 0; index < children.length; index += 2) {
          const key = children[index];
          requireKnown(
            key.kind === 'scalar' && typeof key.result === 'string' && key.result !== '<<'
          );
        }
      }
      frames.at(-1)?.push({ kind: state.kind, result: state.result });
    },
  });
  // Compare both scalar spelling and resolved types: neither "010" -> "10"
  // commands nor boolean -> string matrix values may hide behind normalization.
  return { lexical, semantic: yaml.load(text, { schema: yaml.JSON_SCHEMA }) };
}

function inspectWorkflow(text) {
  const parsed = parseWorkflow(text);
  const workflow = parsed.semantic;
  requireKnown(isMap(workflow) && isMap(workflow.jobs));
  const inherited = permissionMap(workflow.permissions);
  const effective = new Map();
  requireKnown(Object.keys(workflow.jobs).length > 0);
  for (const [name, job] of Object.entries(workflow.jobs)) {
    requireKnown(/^[a-zA-Z_][a-zA-Z0-9_-]*$/u.test(name) && isMap(job));
    effective.set(
      name,
      Object.hasOwn(job, 'permissions') ? permissionMap(job.permissions) : inherited
    );
  }
  for (const document of Object.values(parsed)) {
    delete document.permissions;
    for (const job of Object.values(document.jobs)) delete job.permissions;
  }
  return { parsed, effective };
}

export function isWorkflowPermissionTightening(beforeText, afterText) {
  try {
    const before = inspectWorkflow(beforeText);
    const after = inspectWorkflow(afterText);
    // This also requires identical job IDs, commands, needs, conditions and steps.
    if (!isDeepStrictEqual(before.parsed, after.parsed)) return false;
    let reduced = false;
    for (const [name, previous] of before.effective) {
      const current = after.effective.get(name);
      for (const scope of SCOPES.keys()) {
        const from = LEVELS[previous[scope] ?? 'none'];
        const to = LEVELS[current[scope] ?? 'none'];
        if (to > from) return false;
        if (to < from) reduced = true;
      }
    }
    return reduced;
  } catch {
    // An unproven reduction keeps the existing workflow complexity violation.
    return false;
  }
}
