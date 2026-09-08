import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function googleReviewArgs(prompt, model) {
  // Gemini 0.56: system policies override --admin-policy, so refuse that case.
  const directory =
    process.platform === 'darwin'
      ? '/Library/Application Support/GeminiCli/policies'
      : process.platform === 'win32'
        ? 'C:\\ProgramData\\gemini-cli\\policies'
        : '/etc/gemini-cli/policies';
  try {
    if (fs.readdirSync(directory).some(name => name.endsWith('.toml'))) {
      throw new Error('Reviewer tool denial cannot override existing system policies');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return [
    '-p',
    prompt,
    '--model',
    model,
    '--output-format',
    'json',
    '--approval-mode',
    'default',
    '--extensions',
    'none',
    '--admin-policy',
    fileURLToPath(new URL('./reviewer-no-tools.toml', import.meta.url)),
  ];
}

export const defaultReviewers = ['sonnet'];

export const modelReviewRoutes = {
  sonnet: {
    label: 'Claude Sonnet 5 routine review',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    command: 'claude',
    timeoutMs: 10 * 60_000,
    noOutputTimeoutMs: 300_000,
    args: prompt => [
      '-p',
      prompt,
      '--model',
      'claude-sonnet-5',
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
    args: prompt => googleReviewArgs(prompt, 'gemini-3.1-pro-preview'),
  },
  flash: {
    label: 'Gemini 3.8 Flash fast review',
    provider: 'google',
    model: 'gemini-3.8-flash',
    command: 'gemini',
    timeoutMs: 10 * 60_000,
    noOutputTimeoutMs: 300_000,
    args: prompt => googleReviewArgs(prompt, 'gemini-3.8-flash'),
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
