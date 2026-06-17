export const defaultReviewers = ['sonnet'];

export const modelReviewRoutes = {
  sonnet: {
    label: 'Claude Sonnet architecture/scope review',
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
      '--no-session-persistence',
    ],
  },
  opus: {
    label: 'Claude Opus 4.8 escalation review',
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    command: 'claude',
    timeoutMs: 15 * 60_000,
    noOutputTimeoutMs: 300_000,
    args: prompt => [
      '-p',
      prompt,
      '--model',
      'claude-opus-4-8',
      '--tools',
      '',
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
