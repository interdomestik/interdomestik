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

function isNamedInvokeTag(tag) {
  const nameEnd = tag.search(/\s/u);
  const tagName = nameEnd < 0 ? tag : tag.slice(0, nameEnd);
  const attributes = nameEnd < 0 ? '' : tag.slice(nameEnd);
  return (tagName === 'invoke' || tagName.endsWith(':invoke')) && /\bname\s*=/u.test(attributes);
}

function hasTextToolRequest(value) {
  const text = value.toLowerCase();
  let cursor = 0;
  while ((cursor = text.indexOf('<', cursor)) >= 0) {
    const end = text.indexOf('>', cursor + 1);
    if (end < 0) return isNamedInvokeTag(text.slice(cursor + 1));
    if (isNamedInvokeTag(text.slice(cursor + 1, end))) return true;
    cursor = end + 1;
  }
  return false;
}

function payloadHasToolRequest(payload) {
  const content = Array.isArray(payload?.message?.content) ? payload.message.content : [];
  if (content.some(item => item?.type === 'tool_use' || item?.type === 'tool_result')) return true;
  return [payload?.result, payload?.response, ...content.map(item => item?.text)].some(
    value => typeof value === 'string' && hasTextToolRequest(value)
  );
}

function hasToolRequest(stdout) {
  if (/"type"\s*:\s*"tool_(?:use|result)"/u.test(stdout) || hasTextToolRequest(stdout)) {
    return true;
  }
  try {
    if (payloadHasToolRequest(JSON.parse(stdout))) return true;
  } catch {}
  return stdout.split('\n').some(line => {
    try {
      return payloadHasToolRequest(JSON.parse(line));
    } catch {
      return false;
    }
  });
}

function reviewFacts(stdout) {
  const models = new Set();
  let verdict = null;
  for (const line of [stdout.trim(), ...stdout.trim().split('\n')]) {
    try {
      const payload = JSON.parse(line);
      for (const model of [
        payload.model,
        payload.modelName,
        payload.message?.model,
        ...Object.keys(payload.modelUsage ?? {}),
        ...Object.keys(payload.stats?.models ?? {}),
      ]) {
        if (typeof model === 'string' && model) models.add(model);
      }
      const body = payload.result ?? payload.response;
      if (typeof body === 'string') {
        const finalLine = body.trimEnd().split('\n').at(-1)?.trim();
        verdict = /^VERDICT:[ \t]*(PASS|FINDINGS)$/u.exec(finalLine)?.[1] ?? null;
      }
    } catch {}
  }
  return {
    providerReportedModel: models.size === 1 ? [...models][0] : null,
    reviewVerdict: hasToolRequest(stdout) ? null : verdict,
  };
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
      const overflow =
        stream === 'stdout' &&
        Buffer.byteLength(stdout) + chunk.length > (options.maxCaptureBytes || 256_000);
      if (stream === 'stdout')
        stdout = appendBounded(stdout, chunk, options.maxCaptureBytes || 256_000);
      else stderr = appendBounded(stderr, chunk, options.maxCaptureBytes || 20_000);
      let reason = overflow ? 'reviewer_output_limit' : '';
      if (stream === 'stdout' && hasToolRequest(stdout)) reason = 'reviewer_tool_request';
      else if (stream === 'stderr') reason = classifyBlocker(chunk.toString());
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
