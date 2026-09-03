import { spawn } from 'node:child_process';
import { commandAvailable, statusForClose, timeoutConfig } from './reviewer-route-utils.mjs';

const BLOCKERS = [
  [
    /AuthorizationRequired|re-authorization required|OAuth token refresh failed/i,
    'mcp_auth_required',
  ],
  [/401 Unauthorized|Missing bearer or basic authentication/i, 'api_auth_required'],
  [
    /rate limit|quota exceeded|insufficient_quota|429|too many requests|resource exhausted/i,
    'quota_or_rate_limit',
  ],
  [/Please login|not logged in|login required/i, 'login_required'],
  [/ENOENT|command not found|not found|not on PATH/i, 'missing_cli'],
];

const iso = () => new Date().toISOString();

function appendBounded(current, chunk, maxBytes) {
  const next = current + chunk.toString();
  if (Buffer.byteLength(next) <= maxBytes) return next;
  return next.slice(Math.max(0, next.length - maxBytes));
}

function classifyBlocker(text) {
  return BLOCKERS.find(([pattern]) => pattern.test(text))?.[1] || '';
}

const hasToolRequest = stdout => /"type"\s*:\s*"tool_(?:use|result)"/u.test(stdout);

function reviewFacts(stdout) {
  let model = null;
  let verdict = null;
  for (const line of stdout.trim().split('\n')) {
    try {
      const payload = JSON.parse(line);
      const models = Object.keys(payload.modelUsage ?? {});
      model ??=
        payload.model ??
        payload.modelName ??
        payload.message?.model ??
        (models.length === 1 ? models[0] : null);
      verdict ??= /^VERDICT:\s*(PASS|FINDINGS)\b/mu.exec(payload.result ?? '')?.[1] ?? null;
    } catch {}
  }
  return { providerReportedModel: model, reviewVerdict: hasToolRequest(stdout) ? null : verdict };
}

function terminate(child) {
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  }, 1000).unref();
}

export function skippedRouteReceipt(options) {
  const now = iso();
  return {
    routeName: options.routeName,
    provider: options.provider,
    model: options.model,
    commandInvoked: options.commandInvoked || [],
    startedAt: now,
    endedAt: now,
    elapsedMs: 0,
    status: 'skipped',
    blockerReason: options.blockerReason || '',
    exitCode: null,
    firstOutputTimeout: { timedOut: false, timeoutMs: options.noOutputTimeoutMs ?? null },
    totalTimeout: { timedOut: false, timeoutMs: options.timeoutMs ?? null },
    fallbackWinner: options.fallbackWinner || null,
    configuredModel: options.model,
    providerReportedModel: null,
    candidateIdentity: options.candidateIdentity ?? null,
  };
}

export function runReviewerRoute(options) {
  const env = options.env || process.env;
  const startedAt = iso();
  const startedMs = Date.now();
  const { firstOutputTimeoutMs, totalTimeoutMs } = timeoutConfig(
    options.routeName,
    options.timeoutPreset
  );
  const commandInvoked = options.commandInvoked || [options.command, ...(options.args || [])];
  let stdout = '',
    stderr = '',
    blockerReason = '';
  let firstOutputTimedOut = false,
    totalTimedOut = false;

  const finishReceipt = ({ status, exitCode = null, signal = null, error = '' }) => ({
    routeName: options.routeName,
    provider: options.provider,
    model: options.model,
    configuredModel: options.model,
    ...reviewFacts(stdout),
    candidateIdentity: options.candidateIdentity ?? null,
    commandInvoked,
    startedAt,
    endedAt: iso(),
    elapsedMs: Date.now() - startedMs,
    status,
    blockerReason,
    exitCode,
    signal,
    firstOutputTimeout: { timedOut: firstOutputTimedOut, timeoutMs: firstOutputTimeoutMs },
    totalTimeout: { timedOut: totalTimedOut, timeoutMs: totalTimeoutMs },
    fallbackWinner: options.fallbackWinner || null,
    error,
    stdout,
    stderr,
  });

  if (!commandAvailable(options.command, env)) {
    blockerReason = 'missing_cli';
    return Promise.resolve(finishReceipt({ status: 'blocked', exitCode: 127 }));
  }

  return new Promise(resolve => {
    const child = spawn(options.command, options.args || [], {
      cwd: options.cwd || process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = receipt => {
      clearTimeout(firstTimer);
      clearTimeout(totalTimer);
      resolve(receipt);
    };
    const collect = (stream, chunk) => {
      clearTimeout(firstTimer);
      if (stream === 'stdout')
        stdout = appendBounded(stdout, chunk, options.maxCaptureBytes || 20_000);
      else stderr = appendBounded(stderr, chunk, options.maxCaptureBytes || 20_000);
      const reason =
        stream === 'stdout' && hasToolRequest(stdout)
          ? 'reviewer_tool_request'
          : stream === 'stderr'
            ? classifyBlocker(chunk.toString())
            : '';
      if (reason && !blockerReason) {
        blockerReason = reason;
        terminate(child);
      }
    };
    const firstTimer = setTimeout(() => {
      if (stdout || stderr || blockerReason) return;
      firstOutputTimedOut = true;
      blockerReason = 'reviewer_no_output_timeout';
      terminate(child);
    }, firstOutputTimeoutMs);
    const totalTimer = setTimeout(() => {
      totalTimedOut = true;
      blockerReason ||= 'reviewer_total_timeout';
      terminate(child);
    }, totalTimeoutMs);
    child.stdout.on('data', chunk => collect('stdout', chunk));
    child.stderr.on('data', chunk => collect('stderr', chunk));
    child.on('error', error => {
      blockerReason = classifyBlocker(error.message);
      const status = blockerReason ? 'blocked' : 'failed';
      finish(finishReceipt({ status, exitCode: 127, error: error.message }));
    });
    child.on('close', (code, signal) => {
      const outputBlocker =
        blockerReason || (code === 0 ? '' : classifyBlocker(`${stderr}\n${stdout}`));
      blockerReason = outputBlocker;
      let status = statusForClose(blockerReason, code);
      let error = '';
      const { providerReportedModel: reported, reviewVerdict } = reviewFacts(stdout);
      if (
        status === 'ran' &&
        ['anthropic', 'google', 'openai'].includes(options.provider) &&
        reported !== options.model
      ) {
        status = 'failed';
        error = reported ? `provider model differs: ${reported}` : 'provider model unattested';
      }
      if (
        status === 'ran' &&
        ['anthropic', 'google', 'openai'].includes(options.provider) &&
        reviewVerdict === null
      ) {
        status = 'failed';
        error = 'no explicit PASS or FINDINGS';
      }
      finish(finishReceipt({ status, exitCode: code ?? null, signal, error }));
    });
  });
}
