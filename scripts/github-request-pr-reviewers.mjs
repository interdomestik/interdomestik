#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const DEFAULT_CONFIG = '.github/reviewer-routing.json';
const GH_BINARY_CANDIDATES = ['/usr/bin/gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'];
const GH_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const GH_TIMEOUT_MS = 5 * 60 * 1000;
const ALLOWED_PROMPT = Object.freeze({ id: 'codex', body: '@codex review' });
const SHA40 = /^[a-f0-9]{40}$/u;

export function markerFor(promptId, headSha) {
  return `<!-- interdomestik-reviewer-request:${promptId}:${headSha} -->`;
}

export function promptBody(prompt, headSha) {
  return `${prompt.body}\n\n${markerFor(prompt.id, headSha)}`;
}

export function validateConfig(config) {
  const keys = config && !Array.isArray(config) ? Object.keys(config).sort() : [];
  const prompt = config?.botPrompts?.[0];
  const promptKeys = prompt && !Array.isArray(prompt) ? Object.keys(prompt).sort() : [];
  if (
    keys.join(',') !== 'botPrompts' ||
    !Array.isArray(config.botPrompts) ||
    config.botPrompts.length !== 1 ||
    promptKeys.join(',') !== 'body,id' ||
    prompt.id !== ALLOWED_PROMPT.id ||
    prompt.body !== ALLOWED_PROMPT.body
  ) {
    throw new Error('reviewer routing config must contain only the allowlisted Codex prompt');
  }
  return config;
}

export function assertCurrentHead(observed, current) {
  if (!SHA40.test(observed?.headRefOid ?? '') || !SHA40.test(current?.headRefOid ?? '')) {
    throw new Error('pull request head must be a lowercase 40-character SHA');
  }
  if (observed.number !== current.number || observed.state !== 'OPEN' || current.state !== 'OPEN') {
    throw new Error('pull request identity is not open and stable');
  }
  if (observed.headRefOid !== current.headRefOid) {
    throw new Error(
      `pull request head changed from ${observed.headRefOid} to ${current.headRefOid}`
    );
  }
}

export function flattenCommentPages(pages) {
  if (
    !Array.isArray(pages) ||
    pages.some(
      page =>
        !Array.isArray(page) ||
        page.some(
          comment =>
            !comment ||
            typeof comment !== 'object' ||
            Array.isArray(comment) ||
            typeof comment.body !== 'string'
        )
    )
  ) {
    throw new Error('GitHub comment pagination returned an unexpected shape');
  }
  return pages.flat().map(comment => ({ body: comment.body }));
}

export function buildReviewRequestPlan({ config, pr }) {
  const comments = pr.comments ?? [];
  const botPrompts = (config.botPrompts ?? []).filter(prompt => {
    const marker = markerFor(prompt.id, pr.headRefOid);
    return !comments.some(comment => String(comment.body ?? '').includes(marker));
  });

  return { botPrompts };
}

function parseArgs(argv) {
  const args = { dryRun: false, prNumber: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--' && argv[i + 1]) {
      args.prNumber = argv[++i];
    } else if (!token.startsWith('--') && !args.prNumber) {
      args.prNumber = token;
    } else {
      throw new Error(`unknown argument: ${token}`);
    }
  }
  return args;
}

function ghJson(args) {
  return JSON.parse(
    execFileSync(resolveGhBinary(), args, {
      encoding: 'utf8',
      maxBuffer: GH_MAX_BUFFER_BYTES,
      timeout: GH_TIMEOUT_MS,
    })
  );
}

function gh(args) {
  execFileSync(resolveGhBinary(), args, { stdio: 'inherit', timeout: GH_TIMEOUT_MS });
}

function resolveGhBinary() {
  const binary = GH_BINARY_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!binary) throw new Error(`GitHub CLI not found in: ${GH_BINARY_CANDIDATES.join(', ')}`);
  return binary;
}

function readPr(prNumber) {
  const pr = ghJson([
    'pr',
    'view',
    ...(prNumber ? [prNumber] : []),
    '--json',
    'number,state,headRefOid',
  ]);
  if (!Number.isSafeInteger(pr.number) || pr.number < 1) {
    throw new Error('GitHub returned an invalid pull request number');
  }
  const pages = ghJson([
    'api',
    `repos/{owner}/{repo}/issues/${pr.number}/comments?per_page=100`,
    '--paginate',
    '--slurp',
  ]);
  return { ...pr, comments: flattenCommentPages(pages) };
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(DEFAULT_CONFIG, 'utf8'));
}

function printPlan(pr, plan, dryRun) {
  const mode = dryRun ? 'dry-run' : 'apply';
  console.log(`[reviewers] mode=${mode} pr=${pr.number} head=${pr.headRefOid}`);
  console.log(
    `[reviewers] bot_prompts=${plan.botPrompts.map(prompt => prompt.id).join(',') || 'none'}`
  );
}

const DEFAULT_DEPS = Object.freeze({
  loadConfig,
  postComment: (pr, prompt) =>
    gh(['pr', 'comment', String(pr.number), '--body', promptBody(prompt, pr.headRefOid)]),
  printPlan,
  readPr,
});

export async function main(argv = process.argv.slice(2), deps = DEFAULT_DEPS) {
  const args = parseArgs(argv);
  const config = validateConfig(deps.loadConfig());
  const observed = deps.readPr(args.prNumber);
  assertCurrentHead(observed, observed);
  if (args.dryRun) {
    deps.printPlan(observed, buildReviewRequestPlan({ config, pr: observed }), true);
    return { head: observed.headRefOid, posted: [] };
  }
  const pr = deps.readPr(args.prNumber);
  assertCurrentHead(observed, pr);
  const plan = buildReviewRequestPlan({ config, pr });
  deps.printPlan(pr, plan, false);

  for (const prompt of plan.botPrompts) {
    deps.postComment(pr, prompt);
  }
  const confirmed = deps.readPr(args.prNumber);
  assertCurrentHead(pr, confirmed);
  return { head: confirmed.headRefOid, posted: plan.botPrompts.map(prompt => prompt.id) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(`[reviewers] failed: ${error.message}`);
    process.exit(1);
  }
}
