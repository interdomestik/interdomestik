// Output helpers shared by the verifier's phases.
export const PREFIX = '[verify-machine]';

// Names only, never values; a long list is cut after the first eight.
export function nameList(names) {
  const shown = names.slice(0, 8).join(', ');
  return names.length > 8 ? `${shown} and ${names.length - 8} more` : shown;
}

export function fail(deps, lines) {
  for (const line of lines) deps.error(`${PREFIX} ${line}`);
  return 1;
}

export function logPreCheck(deps, reason, problems = []) {
  deps.log(`${PREFIX} PRE-CHECK: ${reason}; this run is not gate evidence.`);
  for (const problem of problems) deps.log(`${PREFIX}   - ${problem}`);
}

// Outside the clean gate environment the verifier may start only these two commands, both with
// an empty environment.
export const ONLY_ISOLATED_CHILDREN =
  'only the marker ACL check and the shell start-time lookup may have run, both with an empty ' +
  'environment; nothing was recorded';
