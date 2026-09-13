import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectClaudeStream } from './reviewer-claude-stream.mjs';
import { runReviewerRoute } from './reviewer-route-runtime.mjs';

const model = 'claude-sonnet-5';
function fixture() {
  return [
    {
      type: 'system',
      subtype: 'init',
      session_id: 's1',
      model,
      tools: [],
      mcp_servers: [],
      skills: [],
      plugins: [],
      slash_commands: [],
      apiKeySource: 'none',
    },
    {
      type: 'rate_limit_event',
      session_id: 's1',
      rate_limit_info: { status: 'allowed', isUsingOverage: false },
    },
    {
      type: 'assistant',
      session_id: 's1',
      parent_tool_use_id: null,
      message: {
        model,
        role: 'assistant',
        content: [{ type: 'text', text: 'VERDICT: PASS' }],
        usage: { output_tokens: 2 },
      },
    },
    {
      type: 'result',
      subtype: 'success',
      session_id: 's1',
      is_error: false,
      num_turns: 1,
      result: 'VERDICT: PASS',
      permission_denials: [],
      usage: { output_tokens: 2 },
      modelUsage: { [model]: { outputTokens: 2 }, 'claude-haiku-4-5': { outputTokens: 3 } },
    },
  ];
}
const stream = events => events.map(event => JSON.stringify(event)).join('\n');

test('primary Claude identity is separate from all aggregate usage', () => {
  const events = fixture();
  const facts = inspectClaudeStream(stream(events), model);
  assert.equal(facts.providerReportedModel, model);
  assert.equal(facts.evidenceBasis, 'primary-response-model');
  assert.equal(facts.reviewVerdict, 'PASS');
  assert.deepEqual(facts.aggregateModelUsage, events.at(-1).modelUsage);
  assert.deepEqual(facts.primaryResponseUsage, [events[2].message.usage]);
});

test('typed reasoning telemetry is retained without becoming response text', () => {
  const events = fixture();
  const progress = {
    type: 'system',
    subtype: 'thinking_tokens',
    session_id: 's1',
    estimated_tokens: 100,
    estimated_tokens_delta: 50,
  };
  const thinking = {
    ...events[2],
    message: {
      ...events[2].message,
      content: [{ type: 'thinking', thinking: '', signature: 'opaque-signature' }],
    },
  };
  events.splice(2, 0, progress, thinking);
  assert.equal(inspectClaudeStream(stream(events), model).reviewVerdict, 'PASS');
  thinking.message.model = 'other';
  assert.throws(() => inspectClaudeStream(stream(events), model), /primary_model_mismatch/u);
  thinking.message.model = model;
  progress.estimated_tokens_delta = -1;
  assert.throws(() => inspectClaudeStream(stream(events), model), /invalid_thinking_progress/u);
});

for (const [name, mutate] of [
  ['missing primary model', e => delete e[2].message.model],
  ['wrong primary model', e => (e[2].message.model = 'claude-haiku-4-5')],
  [
    'multiple primary models',
    e => e.splice(3, 0, { ...e[2], message: { ...e[2].message, model: 'other' } }),
  ],
  ['wrong init model', e => (e[0].model = 'other')],
  ['missing init', e => e.shift()],
  ['duplicate init', e => e.splice(1, 0, e[0])],
  ['missing result', e => e.pop()],
  ['duplicate result', e => e.push(e.at(-1))],
  ['missing assistant', e => e.splice(2, 1)],
  ['wrong session', e => (e[2].session_id = 'other')],
  ['missing session', e => delete e[1].session_id],
  ['nested assistant', e => (e[2].parent_tool_use_id = 'tool1')],
  ['tool content', e => e[2].message.content.push({ type: 'tool_use', name: 'Bash' })],
  ['tool event', e => e.splice(2, 0, { type: 'tool_result', session_id: 's1' })],
  [
    'subagent event',
    e => e.splice(2, 0, { type: 'system', subtype: 'task_started', session_id: 's1' }),
  ],
  ['failed result', e => (e[3].subtype = 'error_during_execution')],
  ['error result', e => (e[3].is_error = true)],
  ['permission denial', e => e[3].permission_denials.push({ tool: 'Bash' })],
  ['extra turn', e => (e[3].num_turns = 2)],
  ['missing verdict', e => (e[3].result = 'done')],
  ['mismatched result', e => (e[3].result = 'VERDICT: FINDINGS')],
  ['tools enabled', e => (e[0].tools = ['Read'])],
  ['API authentication', e => (e[0].apiKeySource = 'environment')],
  ['paid overage', e => (e[1].rate_limit_info.isUsingOverage = true)],
])
  test(`Claude stream rejects ${name}`, () => {
    const events = fixture();
    mutate(events);
    assert.throws(() => inspectClaudeStream(stream(events), model), /claude_/u);
  });

test('malformed and JSON-only Claude output cannot receive stream identity', () => {
  for (const value of ['', stream(fixture()) + '\ninvalid', JSON.stringify(fixture().at(-1))])
    assert.throws(() => inspectClaudeStream(value, model), /claude_/u);
});

test('typed Claude evidence survives the subprocess receipt boundary', async () => {
  const events = fixture();
  const result = await runReviewerRoute({
    routeName: 'claude-fixture',
    provider: 'anthropic',
    model,
    outputProtocol: 'claude-stream-v1',
    command: process.execPath,
    args: ['-e', `process.stdout.write(${JSON.stringify(stream(events))})`],
  });
  assert.equal(result.status, 'ran');
  assert.equal(result.providerReportedModel, model);
  assert.deepEqual(result.aggregateModelUsage, events.at(-1).modelUsage);
  events[2].message.model = 'wrong';
  const wrong = await runReviewerRoute({
    routeName: 'claude-fixture',
    provider: 'anthropic',
    model,
    outputProtocol: 'claude-stream-v1',
    command: process.execPath,
    args: ['-e', `process.stdout.write(${JSON.stringify(stream(events))})`],
  });
  assert.equal(wrong.status, 'failed');
  assert.equal(wrong.error, 'claude_primary_model_mismatch');
  assert.equal(wrong.exitCode, 0);
  assert.equal(wrong.stdout, stream(events));
});

test('quoted tool syntax is review text, while actual typed tool content fails', async () => {
  const events = fixture();
  events[2].message.content[0].text = 'Finding: reject `<invoke name="Bash">`.\nVERDICT: FINDINGS';
  events[3].result = events[2].message.content[0].text;
  const run = () =>
    runReviewerRoute({
      routeName: 'quoted-code',
      provider: 'anthropic',
      model,
      outputProtocol: 'claude-stream-v1',
      command: process.execPath,
      args: ['-e', `process.stdout.write(${JSON.stringify(stream(events))})`],
    });
  assert.equal((await run()).status, 'ran');
  events[2].message.content.push({ type: 'tool_use', name: 'Bash' });
  const rejected = await run();
  assert.equal(rejected.status, 'failed');
  assert.equal(rejected.reviewVerdict, null);
  assert.match(rejected.error, /tool_or_unknown_content/u);
});
