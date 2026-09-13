import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { runRestrictedClaude } from './reviewer-claude-execution.mjs';
import { inspectClaudeStream } from './reviewer-claude-stream.mjs';
import { reviewerLifecycle } from './reviewer-process-lifecycle.mjs';
import { runNativeReviewer } from './reviewer-native-evidence.mjs';
import {
  classifyBlocker,
  commandAvailable,
  providerFailureReason,
  statusForClose,
  timeoutConfig,
} from './reviewer-route-utils.mjs';

const iso = () => new Date().toISOString();

function appendBounded(current, chunk, maxBytes) {
  const next = current + chunk.toString();
  if (Buffer.byteLength(next) <= maxBytes) return next;
  return next.slice(Math.max(0, next.length - maxBytes));
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

function reviewFacts(stdout, options = {}) {
  if (options.outputProtocol === 'claude-stream-v1') {
    try {
      return inspectClaudeStream(stdout, options.model);
    } catch (error) {
      return { providerReportedModel: null, reviewVerdict: null, validationError: error.message };
    }
  }
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
    blockerReason = '',
    spawnError = '';
  let firstOutputTimedOut = false,
    totalTimedOut = false;

  const finishReceipt = ({ status, exitCode = null, signal = null, error = '' }) => ({
    routeName: options.routeName,
    provider: options.provider,
    model: options.model,
    configuredModel: options.model,
    ...reviewFacts(stdout, options),
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

  if (options.nativeProtocol !== undefined) {
    if (options.nativeProtocol === 'claude-stream-v1') {
      return runRestrictedClaude(options, runReviewerRoute).then(result => ({
        ...finishReceipt(result),
        ...result,
      }));
    }
    if (options.nativeProtocol === 'antigravity-v1') {
      return runNativeReviewer(options).then(result => ({
        ...finishReceipt(result),
        ...result,
      }));
    }
    blockerReason = 'unsupported_native_protocol';
    return Promise.resolve(finishReceipt({ status: 'blocked', exitCode: 125 }));
  }

  if (!commandAvailable(options.command, env)) {
    blockerReason = 'missing_cli';
    return Promise.resolve(finishReceipt({ status: 'blocked', exitCode: 127 }));
  }

  return new Promise(resolve => {
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    const child = spawn(options.command, options.args || [], {
      cwd: options.cwd || process.cwd(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const lifecycle = reviewerLifecycle(
      child,
      () => {
        blockerReason ||= 'reviewer_cancelled';
      },
      options.signal
    );
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
        stdout = appendBounded(
          stdout,
          decoders.stdout.write(chunk),
          options.maxCaptureBytes || 256_000
        );
      else
        stderr = appendBounded(
          stderr,
          decoders.stderr.write(chunk),
          options.maxCaptureBytes || 20_000
        );
      let reason = overflow ? 'reviewer_output_limit' : '';
      if (stream === 'stdout' && hasToolRequest(stdout)) reason = 'reviewer_tool_request';
      else if (stream === 'stderr') reason = classifyBlocker(chunk.toString());
      if (reason && !blockerReason) {
        blockerReason = reason;
        lifecycle.stop();
      }
    };
    const firstTimer = setTimeout(() => {
      if (stdout || stderr || blockerReason) return;
      firstOutputTimedOut = true;
      blockerReason = 'reviewer_no_output_timeout';
      lifecycle.stop();
    }, firstOutputTimeoutMs);
    const totalTimer = setTimeout(() => {
      totalTimedOut = true;
      blockerReason ||= 'reviewer_total_timeout';
      lifecycle.stop();
    }, totalTimeoutMs);
    child.stdout.on('data', chunk => collect('stdout', chunk));
    child.stderr.on('data', chunk => collect('stderr', chunk));
    child.on('error', error => {
      blockerReason ||= classifyBlocker(error.message) || 'reviewer_spawn_failed';
      spawnError = error.message;
    });
    child.on('close', (code, signal) => {
      const cleanupError = lifecycle.close();
      blockerReason ||= cleanupError;
      const outputBlocker =
        blockerReason ||
        (code === 0
          ? ''
          : classifyBlocker(`${stderr}\n${stdout}`) ||
            providerFailureReason(`${stderr}\n${stdout}`));
      blockerReason = outputBlocker;
      let status = statusForClose(blockerReason, code);
      let error = spawnError;
      stdout += decoders.stdout.end();
      stderr += decoders.stderr.end();
      const {
        providerReportedModel: reported,
        reviewVerdict,
        validationError,
      } = reviewFacts(stdout, options);
      if (
        status === 'ran' &&
        ['anthropic', 'google', 'openai'].includes(options.provider) &&
        reported !== options.model
      ) {
        status = 'failed';
        error =
          validationError ||
          (reported ? `provider model differs: ${reported}` : 'provider model unattested');
      }
      if (
        status === 'ran' &&
        ['anthropic', 'google', 'openai'].includes(options.provider) &&
        reviewVerdict === null
      ) {
        status = 'failed';
        error = 'no explicit PASS or FINDINGS';
      }
      finish(finishReceipt({ status, exitCode: spawnError ? 127 : (code ?? null), signal, error }));
    });
  });
}
