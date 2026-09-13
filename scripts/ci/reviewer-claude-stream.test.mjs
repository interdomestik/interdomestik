import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectClaudeStream } from './reviewer-claude-stream.mjs';

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
