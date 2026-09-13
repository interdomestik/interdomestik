import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  captureNative,
  prepareNativeExecutable,
  nativeFailureReceipt,
  verifyExecutable,
  digest,
  requireNative,
  EXECUTABLE_SHA256,
  GOOGLE_TEAM,
} from './reviewer-native-process.mjs';

const MODEL_LABELS = {
  'gemini-3.8-flash-low': 'Gemini 3.8 Flash (Low)',
  'gemini-3.1-pro-high': 'Gemini 3.1 Pro (High)',
};

// Observations only: parsing text never authorizes a route receipt.
export function inspectNativeStream(stdout, expected) {
  let events;
  try {
    events = stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
  } catch {
    throw new Error('native_malformed_stream');
  }
  requireNative(events.length >= 3, 'incomplete_stream');
  for (const event of events) {
    const allowed = {
      init: ['event', 'conversation_id', 'init'],
      step_update: ['event', 'step_update'],
      result: ['event', 'result'],
    }[event?.event];
    requireNative(
      allowed && Object.keys(event).every(key => allowed.includes(key)),
      'unknown_event_field'
    );
  }
  const first = events[0];
  const last = events.at(-1);
  requireNative(first?.event === 'init' && last?.event === 'result', 'event_order');
  const id = first.conversation_id;
  requireNative(typeof id === 'string' && id.length > 0, 'conversation_mismatch');
  requireNative(first.init?.model === expected.model, 'model_mismatch');
  requireNative(first.init?.agent === expected.agent, 'agent_mismatch');
  requireNative(first.init?.cwd === expected.cwd, 'cwd_mismatch');
  requireNative(first.init?.permission_mode === 'request-review', 'permission_mismatch');
  // init.tools is the global inventory, NOT the effective custom-agent allowlist.
  const states = new Map();
  let assistantCompleted = false;
  let completedReads = 0;
  for (const event of events.slice(1, -1)) {
    requireNative(event?.event === 'step_update', 'unknown_event');
    const step = event.step_update;
    requireNative(step?.conversation_id === id, 'conversation_mismatch');
    requireNative(Number.isSafeInteger(step.step_index) && step.step_index >= 0, 'step_index');
    requireNative(['ACTIVE', 'DONE'].includes(step.state), 'step_state');
    const previous = states.get(step.step_index);
    requireNative(
      !previous || (previous.state !== 'DONE' && previous.type === step.step_type),
      'invalid_step_transition'
    );
    requireNative(step.subagent_info === undefined, 'subagent_request');
    if (step.step_type === 'tool') {
      requireNative(
        expected.allowedReadPath &&
          step.tool_name === 'view_file' &&
          step.tool_info?.name === 'view_file' &&
          step.tool_info?.parameters?.AbsolutePath === expected.allowedReadPath,
        'tool_request'
      );
      if (step.state === 'DONE') completedReads += 1;
    } else {
      requireNative(step.tool_name === undefined && step.tool_info === undefined, 'tool_request');
      requireNative(['user_input', 'agent_response'].includes(step.step_type), 'unknown_step');
    }
    if (step.step_type === 'agent_response' && step.state === 'DONE') assistantCompleted = true;
    states.set(step.step_index, { state: step.state, type: step.step_type });
  }
  requireNative(assistantCompleted, 'missing_assistant_completion');
  requireNative(
    [...states.values()].every(step => step.state === 'DONE'),
    'unfinished_step'
  );
  const result = last.result;
  requireNative(result?.conversation_id === id, 'conversation_mismatch');
  requireNative(result.status === 'SUCCESS' && result.num_turns === 1, 'unsuccessful_result');
  requireNative(result.error === undefined, 'result_error');
  const usage = result.usage;
  requireNative(
    usage &&
      ['input_tokens', 'output_tokens', 'total_tokens'].every(
        key => Number.isSafeInteger(usage[key]) && usage[key] > 0
      ) &&
      usage.total_tokens === usage.input_tokens + usage.output_tokens,
    'missing_usage'
  );
  requireNative(typeof result.response === 'string', 'missing_response');
  const finalLine = result.response.trimEnd().split('\n').at(-1)?.trim();
  const reviewVerdict = /^VERDICT:[ \t]*(PASS|FINDINGS)$/u.exec(finalLine)?.[1];
  requireNative(reviewVerdict, 'missing_verdict');
  return {
    providerReportedModel: null,
    nativeSelectedModel: first.init.model,
    evidenceBasis: 'native-selection-inference',
    conversationId: id,
    reviewVerdict,
    response: result.response,
    usage,
    completedReads,
  };
}

export function inspectNativeLog(log, expected) {
  requireNative(
    !/Agent .*not found|agent=false|agentScript=false|model.{0,80}fall(?:ing)? ?back/iu.test(log),
    'fallback_detected'
  );
  requireNative(
    log.includes('Starting new conversation (agent=true)') &&
      log.includes('Creating new cascade trajectory (agentScript=true)'),
    'agent_unresolved'
  );
  const conversations = [...log.matchAll(/Created conversation (\S+)/gu)].map(match => match[1]);
  requireNative(
    conversations.length === 1 && conversations[0] === expected.conversationId,
    'log_conversation_mismatch'
  );
  const selections = [
    ...log.matchAll(/Propagating selected model override to backend: label="([^"]+)"/gu),
  ].map(match => match[1]);
  requireNative(
    selections.length > 0 && selections.every(label => label === MODEL_LABELS[expected.model]),
    'backend_model_mismatch'
  );
}

function agentDefinition(name, readAllowed) {
  return `---\nname: ${name}\ndescription: Isolated closed-packet reviewer\ntools: ${readAllowed ? '[view_file]' : '[]'}\nmainAgent: true\nsubagent: false\ncommandExecutionPolicy: off\nmcpServers: []\nskills: []\nplugins: []\n---\nPerform the supplied task using only capabilities actually made available by the runtime. If a requested capability is unavailable, report that fact; never invent its result.\n`;
}

// This is the sole acceptance boundary: all security evidence originates in these
// parent-owned subprocesses, never in a caller/adapter-provided evidence object.
export async function runNativeReviewer(options) {
  let evidenceDirectory;
  let lastRecord, failedStage;
  try {
    const native = prepareNativeExecutable(options.command);
    evidenceDirectory = native.evidenceDirectory;
    const { env, executable } = native;
    requireNative(
      options.provider === 'google' && MODEL_LABELS[options.model],
      'unsupported_model'
    );
    requireNative(
      typeof options.prompt === 'string' &&
        options.prompt.length > 0 &&
        Buffer.byteLength(options.prompt) <= 768_000,
      'invalid_prompt'
    );
    requireNative(
      !options.args?.length && !options.env && !options.fallbackWinner,
      'caller_controls_forbidden'
    );
    const deadline = Date.now() + 600_000;
    const workspace = path.join(evidenceDirectory, 'workspace');
    fs.mkdirSync(workspace, { mode: 0o700 });
    const token = randomBytes(16).toString('hex');
    const closedAgent = `closed-${token}`;
    const readAgent = `read-${token}`;
    const definitions = [];
    for (const [name, read] of [
      [closedAgent, false],
      [readAgent, true],
    ]) {
      const directory = path.join(workspace, '.agents', 'agents', name);
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const file = path.join(directory, 'agent.md');
      const text = agentDefinition(name, read);
      fs.writeFileSync(file, text, { flag: 'wx', mode: 0o400 });
      definitions.push({ file, sha256: digest(text) });
    }
    const definitionsMatch = () =>
      definitions.every(
        definition => digest(fs.readFileSync(definition.file)) === definition.sha256
      );
    const execute = async (name, args) => {
      failedStage = name;
      lastRecord = undefined;
      lastRecord = await captureNative(executable, args, {
        cwd: workspace,
        env,
        deadline,
        signal: options.signal,
        receiptPath: path.join(evidenceDirectory, `${name}.json`),
      });
      return lastRecord;
    };
    const catalog = await execute('catalog', ['models']);
    requireNative(catalog.stdout.split(/\s+/u).includes(options.model), 'model_not_in_catalog');
    const canaryPath = path.join(workspace, 'public-canary.txt');
    const nonce = `PUBLIC_CANARY_${randomBytes(24).toString('hex')}`;
    fs.writeFileSync(canaryPath, nonce, { flag: 'wx', mode: 0o400 });
    const controlPrompt = `Non-private capability test. Read ONLY ${canaryPath} using view_file and return its exact contents. If that tool is unavailable say UNAVAILABLE. Do not use any other tool, path, browser or delegation. End with exactly VERDICT: PASS. This final verdict reports completion of the test, not whether reading was permitted.`;
    const run = async (name, agent, prompt, allowedReadPath) => {
      failedStage = name;
      lastRecord = undefined;
      requireNative(definitionsMatch(), 'agent_changed');
      const logPath = path.join(evidenceDirectory, `${name}.log`);
      requireNative(!fs.existsSync(logPath), 'log_not_fresh');
      const record = await execute(name, [
        '-p',
        prompt,
        '--model',
        options.model,
        '--agent',
        agent,
        '--add-dir',
        workspace,
        '--disable-slash-commands',
        '--output-format',
        'stream-json',
        '--print-timeout',
        '5m',
        '--log-file',
        logPath,
      ]);
      const facts = inspectNativeStream(record.stdout, {
        model: options.model,
        agent,
        cwd: workspace,
        allowedReadPath,
      });
      requireNative(fs.statSync(logPath).size <= 2_000_000, 'log_limit');
      const log = fs.readFileSync(logPath, 'utf8');
      inspectNativeLog(log, { conversationId: facts.conversationId, model: options.model });
      verifyExecutable(executable, env);
      requireNative(definitionsMatch(), 'agent_changed');
      return {
        ...facts,
        pid: record.pid,
        argv: record.argv,
        cwd: workspace,
        logPath,
        logSha256: digest(log),
        stdoutSha256: digest(record.stdout),
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        record,
      };
    };
    const negative = await run('negative', closedAgent, controlPrompt);
    requireNative(
      !negative.record.stdout.includes(nonce) && negative.response.includes('UNAVAILABLE'),
      'negative_control_failed'
    );
    const positive = await run('positive', readAgent, controlPrompt, canaryPath);
    requireNative(
      positive.completedReads === 1 && positive.response.includes(nonce),
      'positive_control_failed'
    );
    // Only after the paired controls pass does private prompt content enter a child.
    const review = await run('review', closedAgent, options.prompt);
    return {
      status: 'ran',
      exitCode: 0,
      blockerReason: '',
      error: '',
      providerReportedModel: null,
      nativeSelectedModel: options.model,
      evidenceBasis: 'native-selection-inference',
      reviewVerdict: review.reviewVerdict,
      stdout: review.record.stdout,
      stderr: review.record.stderr,
      commandInvoked: review.argv,
      nativeExecutionInference: {
        protocol: 'antigravity-v1',
        evidenceDirectory,
        limitation:
          'Native catalog, selection telemetry and successful usage imply execution; no independent server attestation. Host and same-UID processes are trusted.',
        executable: { path: executable, sha256: EXECUTABLE_SHA256, publisherTeam: GOOGLE_TEAM },
        promptSha256: digest(options.prompt),
        candidateIdentity: options.candidateIdentity ?? null,
        definitions,
        catalog,
        controls: { negative, positive },
        review,
      },
    };
  } catch (error) {
    error.record ??= lastRecord;
    return { ...nativeFailureReceipt(error, evidenceDirectory), failedStage };
  }
}
