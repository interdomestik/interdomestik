import { spawn, spawnSync } from 'node:child_process';
import { reviewerEnv } from './reviewer-env.mjs';
import { normalizeReviewerOutput } from './reviewer-output.mjs';

const OUTPUT_LIMIT = 16 * 1024 * 1024;
const BLOCKERS = [
  [/AuthorizationRequired|re-authorization required|OAuth token refresh failed/i, 'mcp_auth_required'],
  [/401 Unauthorized|Missing bearer or basic authentication/i, 'api_auth_required'],
  [/rate limit|quota exceeded|insufficient_quota|429|too many requests|resource exhausted/i, 'quota_or_rate_limit'],
  [/Please login|not logged in|login required/i, 'login_required'],
];

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

function classifyBlocker(text) {
  const match = BLOCKERS.find(([pattern]) => pattern.test(text));
  return match?.[1] || '';
}

function terminate(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  setTimeout(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }, 1000).unref();
}

export function executeReviewerRoute(route, prompt, options = {}) {
  const env = reviewerEnv(options.env);
  const command = reviewerCommand(route.command);
  const timeoutMs = options.timeoutMs || 900000;
  const firstOutputTimeoutMs = options.noOutputTimeoutMs || Math.min(timeoutMs, 300000);
  if (!command) {
    return Promise.resolve({
      unavailable: true,
      reason: `${route.command} is not an allowed reviewer`,
      exitCode: -1,
      output: '',
      commandInvoked: [route.command],
      blockerReason: 'route_not_allowed',
      firstOutputTimeout: { timedOut: false, timeoutMs: firstOutputTimeoutMs },
      totalTimeout: { timedOut: false, timeoutMs },
    });
  }
  const probe = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    env,
  });
  if (probe.status !== 0) {
    return Promise.resolve({
      unavailable: true,
      reason: 'missing_cli',
      exitCode: -1,
      output: '',
      commandInvoked: [command],
      blockerReason: 'missing_cli',
      firstOutputTimeout: { timedOut: false, timeoutMs: firstOutputTimeoutMs },
      totalTimeout: { timedOut: false, timeoutMs },
    });
  }
  if (options.dryRun) return Promise.resolve({ probeOnly: true, unavailable: false });
  const stdinPrompt = route.stdinPrompt === true;
  const args = reviewerArgs(route, prompt, stdinPrompt);
  return new Promise(resolve => {
    let settled = false;
    let timedOut = false;
    let noOutputTimedOut = false;
    let blockerReason = '';
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
      clearTimeout(firstOutputTimer);
      resolve({
        unavailable: false,
        ...result,
        commandInvoked: [command, ...args],
        blockerReason,
        firstOutputTimeout: { timedOut: noOutputTimedOut, timeoutMs: firstOutputTimeoutMs },
        totalTimeout: { timedOut, timeoutMs },
        output: normalizeReviewerOutput(output, route),
      });
    };
    const collect = chunk => {
      clearTimeout(firstOutputTimer);
      if (Buffer.byteLength(output) < OUTPUT_LIMIT) output += chunk.toString();
      const reason = classifyBlocker(chunk.toString());
      if (reason && !blockerReason) {
        blockerReason = reason;
        terminate(child);
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      blockerReason ||= 'reviewer_total_timeout';
      terminate(child);
    }, timeoutMs);
    const firstOutputTimer = setTimeout(() => {
      if (output || blockerReason) return;
      noOutputTimedOut = true;
      blockerReason = 'reviewer_no_output_timeout';
      terminate(child);
    }, firstOutputTimeoutMs);
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', error => finish({ exitCode: -1, reason: error.message }));
    child.on('close', (code, signal) => {
      if (blockerReason) {
        finish({
          blocked: true,
          reason: blockerReason,
          exitCode: -1,
        });
        return;
      }
      finish({ exitCode: code ?? -1, signal });
    });
    child.stdin.end(stdinPrompt ? prompt : '');
  });
}
