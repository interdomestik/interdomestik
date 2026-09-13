import assert from 'node:assert/strict';
import test from 'node:test';

const native = await import('./reviewer-native-evidence.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
const expected = { model: 'gemini-3.8-flash-low', agent: 'closed-test', cwd: '/private/tmp/test' };
const usage = { input_tokens: 30, output_tokens: 4, thinking_tokens: 0, total_tokens: 34 };
function fixture() {
  return [
    {
      event: 'init',
      conversation_id: 'conversation-1',
      init: { ...expected, tools: ['view_file'], permission_mode: 'request-review' },
    },
    {
      event: 'step_update',
      step_update: {
        conversation_id: 'conversation-1',
        step_index: 0,
        state: 'DONE',
        step_type: 'user_input',
      },
    },
    {
      event: 'step_update',
      step_update: {
        conversation_id: 'conversation-1',
        step_index: 1,
        state: 'DONE',
        step_type: 'agent_response',
        text_delta: 'VERDICT: PASS',
        usage,
      },
    },
    {
      event: 'result',
      result: {
        conversation_id: 'conversation-1',
        status: 'SUCCESS',
        response: 'VERDICT: PASS\n',
        num_turns: 1,
        duration_seconds: 1,
        usage,
      },
    },
  ];
}
const stream = events => events.map(event => JSON.stringify(event)).join('\n') + '\n';
function inspect(events, options = {}) {
  assert.equal(
    typeof native.inspectNativeStream,
    'function',
    'native stream validator is required'
  );
  return native.inspectNativeStream(stream(events), { ...expected, ...options });
}

test('native stream observations distinguish selection from provider attestation', () => {
  const result = inspect(fixture());
  assert.equal(result.nativeSelectedModel, expected.model);
  assert.equal(result.providerReportedModel, null);
  assert.equal(result.reviewVerdict, 'PASS');
  assert.equal(result.conversationId, 'conversation-1');
  assert.equal(result.evidenceBasis, 'native-selection-inference');
  assert.equal(result.status, undefined, 'parser alone cannot authorize a reviewer receipt');
});

for (const [name, mutate] of [
  ['missing init', e => e.shift()],
  ['duplicate init', e => e.splice(1, 0, e[0])],
  ['missing result', e => e.pop()],
  ['duplicate result', e => e.push(e.at(-1))],
  [
    'wrong model',
    e => {
      e[0].init.model = 'gemini-3.1-pro-high';
    },
  ],
  [
    'wrong agent',
    e => {
      e[0].init.agent = 'default';
    },
  ],
  [
    'wrong directory',
    e => {
      e[0].init.cwd = '/repo';
    },
  ],
  [
    'wrong conversation',
    e => {
      e[2].step_update.conversation_id = 'other';
    },
  ],
  [
    'wrong result conversation',
    e => {
      e[3].result.conversation_id = 'other';
    },
  ],
  [
    'tool invocation',
    e => {
      e[2].step_update.step_type = 'tool';
      e[2].step_update.tool_name = 'view_file';
    },
  ],
  [
    'hidden tool metadata',
    e => {
      e[2].step_update.tool_info = { name: 'view_file' };
    },
  ],
  [
    'subagent invocation',
    e => {
      e[2].step_update.subagent_info = {};
    },
  ],
  ['unknown event', e => e.splice(2, 0, { event: 'future_event' })],
  [
    'unknown step',
    e => {
      e[2].step_update.step_type = 'future_step';
    },
  ],
  [
    'failed step',
    e => {
      e[2].step_update.state = 'ERROR';
    },
  ],
  [
    'unfinished step',
    e => {
      e[2].step_update.state = 'ACTIVE';
    },
  ],
  [
    'failed result',
    e => {
      e[3].result.status = 'ERROR';
    },
  ],
  [
    'missing usage',
    e => {
      delete e[3].result.usage;
    },
  ],
  [
    'zero usage',
    e => {
      e[3].result.usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    },
  ],
  [
    'negative usage',
    e => {
      e[3].result.usage = { input_tokens: -2, output_tokens: 4, total_tokens: 2 };
    },
  ],
  [
    'missing verdict',
    e => {
      e[3].result.response = 'Done.';
    },
  ],
  [
    'verdict suffix',
    e => {
      e[3].result.response = 'VERDICT: PASS with caveats';
    },
  ],
  ['no assistant completion', e => e.splice(2, 1)],
  [
    'changed step type',
    e => {
      e.splice(2, 0, {
        event: 'step_update',
        step_update: { ...e[2].step_update, state: 'ACTIVE', step_type: 'user_input' },
      });
    },
  ],
  ['post-completion update', e => e.splice(3, 0, e[2])],
  [
    'terminal error field',
    e => {
      e[3].result.error = 'failure';
    },
  ],
  [
    'extra top-level tool event',
    e => {
      e[2].tool_call = { name: 'view_file' };
    },
  ],
]) {
  test(`native stream rejects ${name}`, () => {
    const events = fixture();
    mutate(events);
    assert.throws(() => inspect(events), /native_/);
  });
}

test('positive control requires an actual completed read of the exact canary', () => {
  const events = fixture();
  const tool = {
    conversation_id: 'conversation-1',
    step_index: 2,
    state: 'DONE',
    step_type: 'tool',
    tool_name: 'view_file',
    tool_info: { name: 'view_file', parameters: { AbsolutePath: '/private/tmp/test/canary.txt' } },
  };
  events.splice(3, 0, { event: 'step_update', step_update: tool });
  const options = { allowedReadPath: '/private/tmp/test/canary.txt' };
  assert.equal(inspect(events, options).completedReads, 1);
  tool.tool_info.parameters.AbsolutePath = '/private/other';
  assert.throws(() => inspect(events, options), /native_tool_request/);
});

test('malformed or blank lines cannot disappear from native evidence', () => {
  const valid = stream(fixture());
  assert.throws(
    () => native.inspectNativeStream(valid + 'not-json\n', expected),
    /native_malformed_stream/
  );
  assert.throws(
    () => native.inspectNativeStream(valid.replace('\n', '\n\n'), expected),
    /native_malformed_stream/
  );
});

test('backend selection must be bound to the exact native conversation and loaded agent', () => {
  assert.equal(typeof native.inspectNativeLog, 'function');
  const log = [
    'Starting new conversation (agent=true)',
    'Creating new cascade trajectory (agentScript=true)',
    'Created conversation conversation-1',
    'Propagating selected model override to backend: label="Gemini 3.8 Flash (Low)"',
  ].join('\n');
  const context = { model: expected.model, conversationId: 'conversation-1' };
  assert.doesNotThrow(() => native.inspectNativeLog(log, context));
  for (const altered of [
    log.replace('agent=true', 'agent=false'),
    log.replace('agentScript=true', 'agentScript=false'),
    log.replace('conversation-1', 'conversation-other'),
    log.replace('conversation-1', 'conversation-10'),
    log.replace('Gemini 3.8 Flash (Low)', 'Gemini 3.1 Pro (High)'),
    log + '\nAgent "closed-test" not found, falling back to default',
    log + '\nPropagating selected model override to backend: label="Other"',
    log.replace(/Propagating[^\n]+/, ''),
  ])
    assert.throws(() => native.inspectNativeLog(altered, context), /native_/);
});
