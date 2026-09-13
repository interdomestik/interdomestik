function requireClaude(condition, reason) {
  if (!condition) throw new Error(`claude_${reason}`);
}

/** Primary response identity and aggregate billing usage are distinct evidence types. */
export function inspectClaudeStream(stdout, expectedModel) {
  let events;
  try {
    events = stdout
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
  } catch {
    throw new Error('claude_malformed_stream');
  }
  requireClaude(events.length >= 3, 'incomplete_stream');
  const init = events[0];
  const result = events.at(-1);
  requireClaude(init?.type === 'system' && init.subtype === 'init', 'missing_init');
  requireClaude(
    typeof init.session_id === 'string' && init.session_id.length > 0,
    'missing_session'
  );
  requireClaude(init.model === expectedModel, 'init_model_mismatch');
  for (const field of ['tools', 'mcp_servers', 'skills', 'plugins', 'slash_commands'])
    requireClaude(Array.isArray(init[field]) && init[field].length === 0, 'capabilities_enabled');
  requireClaude(init.apiKeySource === 'none', 'subscription_auth_required');
  const assistants = [];
  for (const event of events) {
    requireClaude(event?.session_id === init.session_id, 'session_mismatch');
    requireClaude(
      event.parent_tool_use_id == null && event.subagent_info === undefined,
      'nested_event'
    );
  }
  for (const event of events.slice(1, -1)) {
    if (event.type === 'system' && event.subtype === 'thinking_tokens') {
      requireClaude(
        Object.keys(event).every(key =>
          [
            'type',
            'subtype',
            'estimated_tokens',
            'estimated_tokens_delta',
            'uuid',
            'session_id',
          ].includes(key)
        ) &&
          Number.isSafeInteger(event.estimated_tokens) &&
          event.estimated_tokens >= 0 &&
          Number.isSafeInteger(event.estimated_tokens_delta) &&
          event.estimated_tokens_delta >= 0,
        'invalid_thinking_progress'
      );
      continue;
    }
    if (event.type === 'rate_limit_event') {
      requireClaude(event.rate_limit_info?.isUsingOverage !== true, 'paid_overage');
      requireClaude(
        ['allowed', 'allowed_warning'].includes(event.rate_limit_info?.status),
        'rate_limit'
      );
      continue;
    }
    requireClaude(event.type === 'assistant', 'unexpected_event');
    const message = event.message;
    requireClaude(message?.model === expectedModel, 'primary_model_mismatch');
    requireClaude(message.role === 'assistant', 'response_role');
    requireClaude(Array.isArray(message.content) && message.content.length > 0, 'missing_content');
    for (const part of message.content)
      requireClaude(
        (part.type === 'text' && typeof part.text === 'string') ||
          (part.type === 'redacted_thinking' && typeof part.data === 'string') ||
          (part.type === 'thinking' &&
            typeof part.thinking === 'string' &&
            typeof part.signature === 'string'),
        'tool_or_unknown_content'
      );
    assistants.push(message);
  }
  requireClaude(assistants.length > 0, 'missing_primary_response');
  requireClaude(
    result?.type === 'result' && result.subtype === 'success' && result.is_error === false,
    'unsuccessful_result'
  );
  requireClaude(result.num_turns === 1, 'unexpected_turns');
  requireClaude(
    Array.isArray(result.permission_denials) && result.permission_denials.length === 0,
    'permission_denial'
  );
  requireClaude(result.api_error_status == null, 'provider_error');
  requireClaude(typeof result.result === 'string', 'missing_result');
  const response = assistants
    .flatMap(message => message.content.filter(part => part.type === 'text').map(part => part.text))
    .join('');
  requireClaude(response === result.result, 'response_mismatch');
  const finalLine = result.result.trimEnd().split('\n').at(-1)?.trim();
  const reviewVerdict = /^VERDICT:[ \t]*(PASS|FINDINGS)$/u.exec(finalLine)?.[1];
  requireClaude(reviewVerdict, 'missing_verdict');
  return {
    providerReportedModel: expectedModel,
    evidenceBasis: 'primary-response-model',
    sessionId: init.session_id,
    reviewVerdict,
    primaryResponseUsage: assistants.map(message => message.usage ?? null),
    aggregateModelUsage: result.modelUsage ?? null,
    aggregateUsage: result.usage ?? null,
  };
}
