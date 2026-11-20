// The file classifier of the screen-contract checks (WP-05 design §1): one role per file, and the
// R-15 layer that CHK-15a computes with one function for both ends of an edge.
import ts from 'typescript';

import { directiveOf } from '../server-mutation/ast.mjs';

const WEB = 'apps/web/src/';
const SOURCE_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;
const TEST_RE = /(\.test\.|\.spec\.|\.stories\.|(^|\/)__tests__\/|\.d\.ts$)/u;
const SUPPORT_DIRS = new Set([
  'adapters',
  'config',
  'core-contracts',
  'i18n',
  'lib',
  'messages',
  'server',
  'test',
  'types',
  'utils',
]);
const SUPPORT_TOP_FILE_RE = /^(proxy\.ts|instrumentation[^/]*\.ts|sentry\.[^/]*\.ts)$/u;
const ROUTE_FILE_RE = /(^|\/)route\.(ts|js)$/u;
const SUPPORT_PACKAGE_RE = /^packages\/(ui|shared-[^/]+|qa)\/src\//u;

export const ROLES = Object.freeze([
  'screen',
  'handler',
  'action',
  'domain',
  'database',
  'support',
]);

function webRole(inner) {
  if (inner.startsWith('test/')) return 'test';
  if (inner.startsWith('app/api/') || (inner.startsWith('app/') && ROUTE_FILE_RE.test(inner)))
    return 'handler';
  if (inner.startsWith('actions/')) return 'action';
  const top = inner.split('/')[0];
  if (inner.includes('/') && SUPPORT_DIRS.has(top)) return 'support';
  if (SUPPORT_TOP_FILE_RE.test(inner)) return 'support';
  return 'screen';
}

// The role of a repo-relative path, or null when the file is outside every check.
export function roleOf(rel) {
  if (!SOURCE_RE.test(rel) && !rel.endsWith('.d.ts')) return null;
  const inScope = rel.startsWith(WEB) || /^packages\/[^/]+\/src\//u.test(rel);
  if (!inScope) return null;
  if (TEST_RE.test(rel)) return 'test';
  if (rel.startsWith(WEB)) return webRole(rel.slice(WEB.length));
  if (/^packages\/domain-[^/]+\/src\//u.test(rel)) return 'domain';
  if (rel.startsWith('packages/database/src/')) return 'database';
  if (SUPPORT_PACKAGE_RE.test(rel)) return 'support';
  // Another package is not ranked by R-15; it is read as support (unranked).
  return 'support';
}

function scriptKind(rel) {
  if (rel.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (rel.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return /\.[mc]?js$/u.test(rel) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

// The directive prologue of a source text, with WP-02's `directiveOf` semantics.
export function directivesOfText(rel, text) {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false, scriptKind(rel));
  return directiveOf(sf);
}

// The directive prologue of an ESTree Program (the ESLint side of the same rule).
export function directivesOfProgram(program) {
  const out = [];
  for (const statement of program.body) {
    const expression = statement.type === 'ExpressionStatement' ? statement.expression : null;
    if (expression?.type !== 'Literal' || typeof expression.value !== 'string') break;
    out.push(expression.value);
  }
  return out;
}

const LAYER_OF_ROLE = Object.freeze({ handler: 2, action: 2, domain: 3, database: 4, screen: 1 });

// The R-15 layer (1 screen, 2 action/handler, 3 domain, 4 database) or null (support, test,
// outside). A `'use server'` module is layer 2 wherever it lives (B1, B15). `directives` is the
// file's directive list, or its source text.
export function layerOf(rel, directivesOrText) {
  const role = roleOf(rel);
  if (role === null || role === 'test') return null;
  const directives =
    typeof directivesOrText === 'string'
      ? directivesOfText(rel, directivesOrText)
      : (directivesOrText ?? []);
  if (directives.includes('use server')) return 2;
  return LAYER_OF_ROLE[role] ?? null;
}
