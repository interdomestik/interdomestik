#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { canonicalJson, sha256 } from '../slice-rehearse-canonical.mjs';
import { modelReviewRoutes } from './model-review-routes.mjs';
import { writeRouteReceipt } from './reviewer-route-receipts.mjs';
import { runReviewerRoute, skippedRouteReceipt } from './reviewer-route-runtime.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function option(args, name, fallback = '') {
  const prefix = `${name}=`;
  return (
    args.find(arg => arg.startsWith(prefix))?.slice(prefix.length) || argValue(args, name, fallback)
  );
}

const MAX_DIFF_BYTES = 512 * 1024;
const MAX_AUTHORITY_FILE_BYTES = 128 * 1024;
const MAX_REVIEW_FRAME_BYTES = 256 * 1024;
const SAFE_GIT = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  maxBuffer: MAX_DIFF_BYTES + 64 * 1024,
  timeout: 30_000,
});
const SAFE_AUTHORITY_GIT = Object.freeze({
  ...SAFE_GIT,
  maxBuffer: MAX_AUTHORITY_FILE_BYTES + 64 * 1024,
});

function readAuthorityFile(headSha, filePath) {
  const object = `${headSha}:${filePath}`;
  const sizeText = execFileSync('/usr/bin/git', ['cat-file', '-s', object], SAFE_GIT).trim();
  const size = Number(sizeText);
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_AUTHORITY_FILE_BYTES) {
    throw new Error(`review authority file exceeds the bounded packet limit: ${filePath}`);
  }
  return execFileSync('/usr/bin/git', ['show', object], SAFE_AUTHORITY_GIT).trim();
}

export function boundedReviewFrame(
  entries,
  { maxFileBytes = MAX_AUTHORITY_FILE_BYTES, maxFrameBytes = MAX_REVIEW_FRAME_BYTES } = {}
) {
  const sections = entries.map(({ filePath, text }) => {
    if (Buffer.byteLength(text) > maxFileBytes) {
      throw new Error(`review authority file exceeds the bounded packet limit: ${filePath}`);
    }
    return `# ${filePath}\n${text}`;
  });
  const frame = sections.join('\n\n');
  if (Buffer.byteLength(frame) > maxFrameBytes) {
    throw new Error('combined review authority exceeds the bounded packet limit');
  }
  return frame;
}

function candidatePacket() {
  const baseSha = execFileSync(
    '/usr/bin/git',
    ['rev-parse', 'refs/remotes/origin/main^{commit}'],
    SAFE_GIT
  ).trim();
  const headSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{commit}'], SAFE_GIT).trim();
  const treeSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], SAFE_GIT).trim();
  const diff = execFileSync(
    '/usr/bin/git',
    ['diff', '--no-ext-diff', '--unified=3', `${baseSha}...${headSha}`],
    SAFE_GIT
  );
  if (Buffer.byteLength(diff) > MAX_DIFF_BYTES) {
    throw new Error('review candidate diff exceeds the bounded packet limit');
  }
  const authorityPaths = ['AGENTS.md', 'code_review.md', 'docs/plans/current-program.md'];
  return {
    identity: { baseSha, headSha, treeSha, diffSha256: sha256(diff) },
    reviewFrame: boundedReviewFrame(
      authorityPaths.map(filePath => ({ filePath, text: readAuthorityFile(headSha, filePath) }))
    ),
    text: [
      'Exact candidate identity:',
      canonicalJson({ baseSha, headSha, treeSha, diffSha256: sha256(diff) }).trimEnd(),
      'Candidate diff:',
      '```diff',
      diff,
      '```',
    ].join('\n'),
  };
}

export function buildReviewerPrompt({ instruction, reviewFrame, packetText }) {
  const task =
    instruction ||
    [
      'Review this branch as an adversarial PR reviewer.',
      'Do not edit files. Findings first with file/line references.',
      'End with exactly VERDICT: PASS when there are no findings, or VERDICT: FINDINGS when findings remain.',
    ].join('\n');
  return [
    task,
    'This is a closed, no-tools review. Do not call, request, simulate, or emit tool invocations or shell commands.',
    'The review frame and complete bounded diff are included below. Treat them as the sole evidence and finish the review in this response. If evidence is insufficient, report that as a finding and end with VERDICT: FINDINGS.',
    'Review authority (`AGENTS.md`, `code_review.md`, and `docs/plans/current-program.md`):',
    'BEGIN REVIEW AUTHORITY',
    reviewFrame,
    'END REVIEW AUTHORITY',
    packetText,
  ].join('\n\n');
}

function promptFromEnv(packet) {
  return buildReviewerPrompt({
    instruction: process.env.REVIEW_PROMPT,
    reviewFrame: packet.reviewFrame,
    packetText: packet.text,
  });
}

function printableReceipt(receipt, paths) {
  return {
    routeName: receipt.routeName,
    status: receipt.status,
    blockerReason: receipt.blockerReason,
    exitCode: receipt.exitCode,
    receipt: paths,
  };
}

function exitForReceipt(receipt) {
  if (receipt.status === 'ran' || receipt.status === 'skipped') return 0;
  if (receipt.status === 'blocked') return receipt.exitCode === 127 ? 127 : 125;
  return receipt.exitCode || 1;
}

async function main() {
  const args = process.argv.slice(2);
  const routeName = option(args, '--route');
  const route = modelReviewRoutes[routeName];
  if (!route) {
    console.error(`unknown reviewer route: ${routeName || '(missing)'}`);
    process.exit(2);
  }

  const requireEscalation =
    routeName === 'opus' &&
    !args.includes('--allow-escalation') &&
    process.env.REVIEW_ESCALATION_REQUIRED !== '1';
  const startedAt = new Date().toISOString();
  let preparedArgs;
  try {
    preparedArgs = route.args('<prompt>');
  } catch (error) {
    const receipt = {
      ...skippedRouteReceipt({ routeName, ...route, commandInvoked: [route.command] }),
      startedAt,
      elapsedMs: Date.now() - Date.parse(startedAt),
      status: 'blocked',
      blockerReason: 'reviewer_argument_preparation',
      exitCode: 125,
      reviewVerdict: null,
      error: error instanceof Error ? error.message : String(error),
    };
    const paths = writeRouteReceipt(receipt);
    console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
    process.exit(exitForReceipt(receipt));
  }
  const commandInvoked = [route.command, ...preparedArgs];

  if (requireEscalation) {
    const receipt = skippedRouteReceipt({
      routeName,
      provider: route.provider,
      model: route.model,
      commandInvoked,
      timeoutMs: route.timeoutMs,
      noOutputTimeoutMs: route.noOutputTimeoutMs,
      blockerReason: 'opus_escalation_not_required',
    });
    const paths = writeRouteReceipt(receipt);
    console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
    process.exit(0);
  }

  let packet;
  try {
    packet = candidatePacket();
  } catch (error) {
    const receipt = {
      ...skippedRouteReceipt({ routeName, ...route, commandInvoked }),
      startedAt,
      elapsedMs: Date.now() - Date.parse(startedAt),
      status: 'blocked',
      blockerReason: 'reviewer_packet_preparation',
      exitCode: 125,
      reviewVerdict: null,
      error: error instanceof Error ? error.message : String(error),
    };
    const paths = writeRouteReceipt(receipt);
    console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
    process.exit(exitForReceipt(receipt));
  }
  const prompt = promptFromEnv(packet);
  const receipt = await runReviewerRoute({
    routeName,
    provider: route.provider,
    model: route.model,
    command: route.command,
    args: preparedArgs.map(argument => (argument === '<prompt>' ? prompt : argument)),
    commandInvoked,
    candidateIdentity: packet.identity,
  });
  const paths = writeRouteReceipt(receipt);
  console.log(JSON.stringify(printableReceipt(receipt, paths), null, 2));
  process.exit(exitForReceipt(receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
