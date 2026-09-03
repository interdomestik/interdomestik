export const defaultReviewers = ['sonnet'];

export const modelReviewRoutes = {
  sonnet: {
    label: 'Claude Sonnet architecture review',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    command: 'claude',
    timeoutMs: 10 * 60_000,
    noOutputTimeoutMs: 300_000,
    args: prompt => [
      '-p',
      prompt,
      '--model',
      'claude-sonnet-4-6',
      '--tools',
      '',
      '--output-format',
      'json',
      '--no-session-persistence',
    ],
  },
  opus: {
    label: 'Claude Opus 5 escalation',
    provider: 'anthropic',
    model: 'claude-opus-5',
    command: 'claude',
    timeoutMs: 30 * 60_000,
    noOutputTimeoutMs: 300_000,
    args: prompt => [
      '-p',
      prompt,
      '--model',
      'claude-opus-5',
      '--tools',
      '',
      '--output-format',
      'stream-json',
      '--verbose',
      '--no-session-persistence',
    ],
  },
  opus48: {
    label: 'Opus 4.8 lightweight',
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    command: 'claude',
    timeoutMs: 10 * 60_000,
    noOutputTimeoutMs: 300_000,
    args: prompt => [
      '-p',
      prompt,
      '--model',
      'claude-opus-4-8',
      '--tools',
      '',
      '--output-format',
      'json',
      '--no-session-persistence',
    ],
  },
  gemini: {
    label: 'Gemini product/design review',
    provider: 'google',
    model: 'gemini-3.1-pro-preview',
    command: 'gemini',
    timeoutMs: 10 * 60_000,
    noOutputTimeoutMs: 300_000,
    args: prompt => ['-p', prompt, '--model', 'gemini-3.1-pro-preview', '--output-format', 'text'],
  },
};

export function parseReviewerList(value, fallback = defaultReviewers) {
  const reviewers = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return reviewers.length > 0 ? reviewers : fallback;
}

export function assertKnownReviewers(reviewers) {
  const unknown = reviewers.filter(reviewer => !modelReviewRoutes[reviewer]);
  if (unknown.length > 0) {
    throw new Error(`unknown model reviewer route(s): ${unknown.join(', ')}`);
  }
}
