import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertKnownReviewers, parseReviewerList } from './model-review-routes.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function fail(message, details = {}) {
  console.error(`model-review evidence failed: ${message}`);
  if (Object.keys(details).length > 0) console.error(JSON.stringify(details, null, 2));
  process.exit(1);
}

function readReceipt(runRoot) {
  const file = path.join(runRoot, 'reviews', 'model-review-access.json');
  if (!fs.existsSync(file)) fail('missing access receipt', { file });
  return { file, receipt: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

export function evaluateReceipt(receipt, options) {
  const results = Array.isArray(receipt.results) ? receipt.results : [];
  const resultByReviewer = new Map(results.map(result => [result.reviewer, result]));
  const missingRequired = options.required.filter(reviewer => !resultByReviewer.has(reviewer));
  const blockedRequired = options.required.filter(reviewer => {
    const result = resultByReviewer.get(reviewer);
    return result?.status === 'blocked';
  });
  const blockedOptional = options.optional.filter(reviewer => {
    const result = resultByReviewer.get(reviewer);
    return result?.status === 'blocked';
  });
  const commandOnlyRequired = options.requireCall
    ? options.required.filter(reviewer => resultByReviewer.get(reviewer)?.status === 'available')
    : [];
  return { missingRequired, blockedRequired, blockedOptional, commandOnlyRequired };
}

function main() {
  const args = process.argv.slice(2);
  const runRoot = argValue(args, '--run-root');
  if (!runRoot) fail('missing --run-root');
  const required = parseReviewerList(argValue(args, '--required'), ['sonnet']);
  const optional = parseReviewerList(argValue(args, '--optional'), []);
  const requireCall = args.includes('--require-call');
  assertKnownReviewers([...new Set([...required, ...optional])]);

  const { file, receipt } = readReceipt(runRoot);
  const result = evaluateReceipt(receipt, { required, optional, requireCall });
  if (result.missingRequired.length > 0) fail('required reviewers missing', result);
  if (result.blockedRequired.length > 0) fail('required reviewers blocked', result);
  if (result.commandOnlyRequired.length > 0) fail('required reviewers need call proof', result);
  console.log(
    result.blockedOptional.length > 0
      ? 'model-review evidence passed with blocked optional routes'
      : 'model-review evidence passed'
  );
  console.log(`[model-review-evidence] receipt=${file}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
