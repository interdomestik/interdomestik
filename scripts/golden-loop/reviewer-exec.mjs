import { spawn, spawnSync } from 'node:child_process';
import { reviewerEnv } from './reviewer-env.mjs';
import { normalizeReviewerOutput } from './reviewer-output.mjs';

const OUTPUT_LIMIT = 16 * 1024 * 1024;

function reviewerCommand(name) {
  if (name === 'claude') return 'claude';
  if (name === 'gemini') return 'gemini';
  return null;
}

function reviewerArgs(route, prompt, stdinPrompt) {
  const args = route.args
    .filter(arg => !(stdinPrompt && arg === '{prompt}'))
    .map(arg => (arg === '{prompt}' ? prompt : arg));
  return args;
}

export function executeReviewerRoute(route, prompt, options = {}) {
  const env = reviewerEnv(options.env);
  const command = reviewerCommand(route.command);
  if (!command) {
    return Promise.resolve({
      unavailable: true,
      reason: `${route.command} is not an allowed reviewer`,
      exitCode: -1,
      output: '',
    });
  }
  const probe = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    env,
  });
  if (probe.status !== 0) {
    return Promise.resolve({
      unavailable: true,
      reason: `${command} not on PATH`,
      exitCode: -1,
      output: '',
    });
  }
  if (options.dryRun) return Promise.resolve({ probeOnly: true, unavailable: false });
  const stdinPrompt = route.stdinPrompt === true;
  const args = reviewerArgs(route, prompt, stdinPrompt);
  return new Promise(resolve => {
    let settled = false;
    let timedOut = false;
    let output = '';
    const child = spawn(command, args, {
      detached: true,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ unavailable: false, ...result, output: normalizeReviewerOutput(output, route) });
    };
    const collect = chunk => {
      if (Buffer.byteLength(output) < OUTPUT_LIMIT) output += chunk.toString();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {}
      setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 1000).unref();
    }, options.timeoutMs || 900000);
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', error => finish({ exitCode: -1, reason: error.message }));
    child.on('close', (code, signal) => {
      if (timedOut) {
        finish({
          blocked: true,
          reason: `route timed out after ${Math.ceil((options.timeoutMs || 0) / 1000)}s`,
          exitCode: -1,
        });
        return;
      }
      finish({ exitCode: code ?? -1, signal });
    });
    child.stdin.end(stdinPrompt ? prompt : '');
  });
}
