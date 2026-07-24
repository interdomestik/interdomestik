import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { Z620_EXECUTABLES } from './managed-executables.mjs';

export function safeId(value, label = 'identifier') {
  const normalized = String(value ?? '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

export function redact(text, env = process.env) {
  let output = String(text ?? '');
  for (const [name, value] of Object.entries(env)) {
    if (!/(token|secret|password|private|api_key|dsn)/i.test(name) || !value) continue;
    output = output.split(String(value)).join('[REDACTED]');
  }
  output = output.replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[REDACTED]@');
  output = output.replace(
    /("name"\s*:\s*"better-auth\.session_token"[\s\S]{0,200}?"value"\s*:\s*")[^"]+/gi,
    '$1[REDACTED]'
  );
  return output.replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[REDACTED]');
}

export function workflowJobs(root, workflowPath) {
  const document = yaml.load(fs.readFileSync(path.join(root, workflowPath), 'utf8'));
  return Object.keys(document?.jobs ?? {}).sort((left, right) => left.localeCompare(right));
}

export function validateParity(root, parity) {
  const configured = Object.keys(parity.workflows ?? {}).sort((left, right) =>
    left.localeCompare(right)
  );
  const problems = [];
  for (const workflowPath of configured) {
    if (!fs.existsSync(path.join(root, workflowPath))) {
      problems.push(`${workflowPath}: missing workflow`);
      continue;
    }
    const actual = workflowJobs(root, workflowPath);
    const expected = Object.keys(parity.workflows[workflowPath]).sort((left, right) =>
      left.localeCompare(right)
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `${workflowPath}: jobs actual=${actual.join(',')} expected=${expected.join(',')}`
      );
    }
  }
  return problems;
}

export function createRun(runsRoot, sha, lane) {
  const shortSha = safeId(sha, 'sha').slice(0, 12);
  const runId = safeId(
    `${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${shortSha}-${lane}-${randomBytes(3).toString('hex')}`,
    'run id'
  );
  const runDir = path.join(runsRoot, runId);
  for (const directory of ['logs', 'artifacts', 'worktree']) {
    fs.mkdirSync(path.join(runDir, directory), { recursive: true, mode: 0o700 });
  }
  return { runDir, runId };
}

export function acquireLaneLock(stateRoot, lane) {
  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const lockPath = path.join(stateRoot, `${safeId(lane, 'lane')}.lock`);
  fs.mkdirSync(lockPath);
  fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid }));
  return () => fs.rmSync(lockPath, { recursive: true, force: true });
}

export function materializeClone(source, destination, sha) {
  execFileSync(Z620_EXECUTABLES.git, ['clone', '--no-checkout', '--shared', source, destination], {
    stdio: 'pipe',
  });
  execFileSync(Z620_EXECUTABLES.git, ['-C', destination, 'checkout', '--detach', sha], {
    stdio: 'pipe',
  });
  const resolved = execFileSync(Z620_EXECUTABLES.git, ['-C', destination, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const dirty = execFileSync(Z620_EXECUTABLES.git, ['-C', destination, 'status', '--porcelain'], {
    encoding: 'utf8',
  }).trim();
  if (resolved !== sha || dirty) throw new Error('Materialized clone is not the exact clean SHA');
  return resolved;
}

export function writeJson(filePath, value, { exclusive = false } = {}) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: exclusive ? 'wx' : 'w',
    mode: 0o600,
  });
}

export function captureCommand(command, args = [], env = process.env) {
  try {
    return {
      status: 'pass',
      output: redact(
        execFileSync(command, args, {
          encoding: 'utf8',
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        }).trim(),
        env
      ),
    };
  } catch (error) {
    return {
      status: 'fail',
      exitCode: error.status ?? 1,
      output: redact(`${error.stdout ?? ''}${error.stderr ?? ''}`.trim(), env),
    };
  }
}

export function checksumEvidence(runDir, relativePaths) {
  const checksums = {};
  for (const relativePath of relativePaths.sort((left, right) => left.localeCompare(right))) {
    const content = fs.readFileSync(path.join(runDir, relativePath));
    checksums[relativePath] = createHash('sha256').update(content).digest('hex');
  }
  writeJson(path.join(runDir, 'checksums.json'), checksums);
  return checksums;
}
