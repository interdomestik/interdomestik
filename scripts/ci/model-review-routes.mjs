export const defaultReviewers = ['sonnet', 'gemini', 'copilot'];

export const modelReviewRoutes = {
  sonnet: {
    label: 'Claude Sonnet architecture/scope review',
    command: 'claude',
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
  gemini: {
    label: 'Gemini product/design review',
    command: 'gemini',
    args: prompt => ['-p', prompt, '--model', 'gemini-3.1-pro-preview', '--output-format', 'text'],
  },
  copilot: {
    label: 'Copilot Sonnet fallback review',
    command: 'copilot',
    args: prompt => [
      '--model',
      'claude-sonnet-4.6',
      '-p',
      prompt,
      '--available-tools=',
      '--disable-builtin-mcps',
      '--no-custom-instructions',
      '--no-color',
      '--silent',
    ],
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
