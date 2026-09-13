import fs from 'node:fs';
import path from 'node:path';
import { commandAvailable } from './reviewer-route-utils.mjs';
import { runReviewerRoute } from './reviewer-route-runtime.mjs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  assertKnownReviewers,
  modelReviewRoutes,
  parseReviewerList,
} from './model-review-routes.mjs';

const PROMPT =
  'Public transport check only. No private context, files, tools, or delegation. Reply exactly: VERDICT: PASS';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
}

export async function runProbe(route, probe, routeName) {
  if (!commandAvailable(route.command, process.env)) {
    return { status: 'blocked', reason: `${route.command} command unavailable` };
  }
  if (probe === 'command') {
    return {
      status: 'available',
      reason: 'command available; signature/auth/quota/model not probed',
    };
  }
  let args;
  try {
    args = route.args(PROMPT);
  } catch (error) {
    return { status: 'blocked', reason: `reviewer_argument_preparation: ${error.message}` };
  }
  const receipt = await runReviewerRoute({
    routeName,
    provider: route.provider,
    model: route.model,
    command: route.command,
    nativeProtocol: route.nativeProtocol,
    prompt: PROMPT,
    args,
    commandInvoked: [route.command, ...route.args('<prompt>')],
    candidateIdentity: { purpose: 'public-only access probe; not a private review' },
  });
  return {
    status: receipt.status === 'ran' ? 'completed' : receipt.status,
    reason: receipt.error || receipt.blockerReason || 'restricted public probe completed',
    receipt,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const required = parseReviewerList(argValue(args, '--required'), ['sonnet']);
  const reviewers = [
    ...new Set([...parseReviewerList(argValue(args, '--reviewers')), ...required]),
  ];
  const probe = argValue(args, '--probe', 'call');
  if (!['call', 'command'].includes(probe)) throw new Error('--probe must be call or command');
  assertKnownReviewers(reviewers);

  const runRoot =
    argValue(args, '--run-root') || path.join('tmp', 'model-review-access', timestamp());
  const reviewDir = path.join(runRoot, 'reviews');
  fs.mkdirSync(reviewDir, { recursive: true });

  const results = [];
  for (const reviewer of reviewers) {
    const route = modelReviewRoutes[reviewer];
    results.push({
      reviewer,
      required: required.includes(reviewer),
      label: route.label,
      ...(await runProbe(route, probe, reviewer)),
    });
  }
  const acceptableRequired = probe === 'command' ? ['available', 'completed'] : ['completed'];
  const blockedRequired = results.filter(
    result => result.required && !acceptableRequired.includes(result.status)
  );
  let status = 'pass';
  if (blockedRequired.length > 0) {
    status = 'blocked';
  } else if (probe === 'command') {
    status = 'available';
  }
  const receipt = {
    status,
    probe,
    generatedAt: new Date().toISOString(),
    reviewers,
    required,
    results,
  };
  const out = path.join(reviewDir, 'model-review-access.json');
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[model-review-access] receipt=${out}`);
  if (blockedRequired.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
