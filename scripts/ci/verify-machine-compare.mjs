import { environmentErrors } from './verify-machine-env.mjs';

function mismatch(field, expected, actual) {
  return expected === actual ? [] : [`${field}: marker ${expected}, this run ${actual ?? 'none'}`];
}

function digestOf(image) {
  return /@(sha256:[0-9a-f]{64})$/u.exec(image ?? '')?.[1] ?? null;
}

function databaseContainerErrors(marker, database, ciPostgresDigest) {
  const name = marker.database.container;
  if (!database) return [`database container ${name} was not found`];
  const errors = [...mismatch('database.image', marker.database.image, database.image)];
  if (!database.running) errors.push(`database container ${name} is not running`);
  const expected = `${marker.database.host}:${marker.database.port}`;
  if (database.bindings.length === 0)
    errors.push(`database container is not published on ${expected}`);
  for (const binding of database.bindings) {
    const published = `${binding.hostIp}:${binding.hostPort}`;
    if (binding.containerPort !== '5432/tcp' || published !== expected) {
      errors.push(
        `database container publishes ${binding.containerPort} on ${published}; only 5432/tcp on ${expected} is allowed`
      );
    }
  }
  if (!ciPostgresDigest) errors.push('the CI postgres image digest could not be read');
  else if (digestOf(marker.database.image) !== ciPostgresDigest) {
    errors.push('database.image digest differs from the CI postgres service image');
  }
  return errors;
}

/**
 * Every difference between the marker and the live machine, without printing the hardware id.
 * `begin` also needs free disk and a fully clean tree; `stamp` re-checks the rest after the run.
 */
export function compareMachine(marker, live, { phase = 'begin' } = {}) {
  const errors = [];
  if (live.hardwareUuidSha256 !== marker.machine.hardware_uuid_sha256) {
    errors.push('machine.hardware_uuid_sha256 does not match this machine');
  }
  errors.push(
    ...mismatch('machine.arch', marker.machine.arch, live.arch),
    ...mismatch('os.version', marker.os.version, live.os.version),
    ...mismatch('os.build', marker.os.build, live.os.build),
    ...mismatch('node', marker.node, live.node),
    ...mismatch('pnpm', marker.pnpm, live.pnpm),
    ...mismatch(
      'container_runtime.context',
      marker.container_runtime.context,
      live.container.context
    ),
    ...mismatch('container_runtime.engine', marker.container_runtime.engine, live.container.engine),
    ...databaseContainerErrors(marker, live.database, live.ciPostgresDigest),
    ...environmentErrors(marker, live.env, live.sources)
  );
  if (live.git.hiddenFromStatus !== 0) {
    errors.push('tracked files are hidden from git status (assume-unchanged or skip-worktree)');
  }
  if (phase === 'stamp') {
    if (!live.git.trackedClean) errors.push('tracked files changed during the run');
    return errors;
  }
  for (const [volume, freeGib] of Object.entries(live.freeGib)) {
    if (!Number.isFinite(freeGib) || freeGib < marker.min_free_gib) {
      errors.push(`free disk on ${volume} is ${freeGib} GiB, below ${marker.min_free_gib} GiB`);
    }
  }
  if (!live.git.clean) errors.push('the working tree is not clean');
  return errors;
}
