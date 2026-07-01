#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const DEFAULT_CONFIG = '.github/reviewer-routing.json';
const GH_BINARY_CANDIDATES = ['/usr/bin/gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'];

export function markerFor(promptId, headSha) {
  return `<!-- interdomestik-reviewer-request:${promptId}:${headSha} -->`;
}

export function promptBody(prompt, headSha) {
  return `${prompt.body}\n\n${markerFor(prompt.id, headSha)}`;
}

export function buildReviewRequestPlan({ config, pr, force = false }) {
  const comments = pr.comments ?? [];
  const requestedReviewerLogins = new Set(
    (pr.reviewRequests ?? []).map(request => request.login).filter(Boolean)
  );
  const botReviewers = (config.botReviewers ?? []).filter(reviewer => {
    if (force) return true;
    return !requestedReviewerLogins.has(reviewer.login);
  });
  const botPrompts = (config.botPrompts ?? []).filter(prompt => {
    if (force) return true;
    const marker = markerFor(prompt.id, pr.headRefOid);
    return !comments.some(comment => String(comment.body ?? '').includes(marker));
  });

  return { botReviewers, botPrompts };
}

function parseArgs(argv) {
  const args = { configPath: DEFAULT_CONFIG, dryRun: false, force: false, prNumber: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--config') {
      args.configPath = argv[++i] ?? '';
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--force') {
      args.force = true;
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
  return JSON.parse(execFileSync(resolveGhBinary(), args, { encoding: 'utf8' }));
}

function gh(args) {
  execFileSync(resolveGhBinary(), args, { stdio: 'inherit' });
}

function ghQuiet(args) {
  execFileSync(resolveGhBinary(), args, { stdio: 'pipe' });
}

function resolveGhBinary() {
  const binary = GH_BINARY_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!binary) throw new Error(`GitHub CLI not found in: ${GH_BINARY_CANDIDATES.join(', ')}`);
  return binary;
}

function readPr(prNumber) {
  return ghJson([
    'pr',
    'view',
    ...(prNumber ? [prNumber] : []),
    '--json',
    'number,headRefOid,comments,reviewRequests',
  ]);
}

function loadConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function printPlan(pr, plan, dryRun) {
  const mode = dryRun ? 'dry-run' : 'apply';
  console.log(`[reviewers] mode=${mode} pr=${pr.number} head=${pr.headRefOid}`);
  console.log(
    `[reviewers] bot_reviewers=${plan.botReviewers.map(reviewer => reviewer.id).join(',') || 'none'}`
  );
  console.log(`[reviewers] bot_prompts=${plan.botPrompts.map(prompt => prompt.id).join(',') || 'none'}`);
}

function requestBotReviewers(pr, reviewers) {
  for (const reviewer of reviewers) {
    ghQuiet([
      'api',
      '-X',
      'POST',
      `repos/{owner}/{repo}/pulls/${pr.number}/requested_reviewers`,
      '-f',
      `reviewers[]=${reviewer.login}`,
    ]);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const config = loadConfig(args.configPath);
  const pr = readPr(args.prNumber);
  const plan = buildReviewRequestPlan({ config, pr, force: args.force });
  printPlan(pr, plan, args.dryRun);

  if (args.dryRun) return;

  requestBotReviewers(pr, plan.botReviewers);

  for (const prompt of plan.botPrompts) {
    gh(['pr', 'comment', String(pr.number), '--body', promptBody(prompt, pr.headRefOid)]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await main();
  } catch (error) {
    console.error(`[reviewers] failed: ${error.message}`);
    process.exit(1);
  }
}
