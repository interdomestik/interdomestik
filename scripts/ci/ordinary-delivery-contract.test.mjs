import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const section = (text, heading) => {
  const start = text.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `Missing delivery section: ${heading}`);
  const content = text.slice(start + heading.length + 1);
  return content.split(/\n#{1,3} /u)[0].replace(/\s+/gu, ' ');
};

const agents = read('AGENTS.md');
const program = read('docs/plans/current-program.md');
const tracker = read('docs/plans/current-tracker.md');
const ordinaryInstructions = [
  section(agents, '## Ordinary Delivery'),
  section(program, '## Ordinary Product Delivery'),
];

test('ordinary entry instructions retain coarse limits without exact accounting admission', () => {
  for (const text of ordinaryInstructions) {
    assert.match(text, /repo:size:check/u);
    assert.match(text, /growth is advisory/u);
    assert.match(text, /coarse largest-file/u);
    assert.match(text, /no exact allocation/iu);
  }
  assert.match(ordinaryInstructions[1], /Historical allocations remain evidence/u);
  assert.match(program, /explicit legacy work/u);
});

test('ordinary delivery does not require ritual companion PRs or collapse delivery states', () => {
  for (const text of ordinaryInstructions) {
    assert.match(text, /one bounded protected PR/iu);
    assert.match(text, /status-only/u);
  }
  assert.match(program, /prepared, tested, merged, deployed and user-validated states separately/u);
  assert.match(agents, /Never auto-merge or deploy without explicit authority/u);
  assert.match(tracker, /No deployment, product readiness or user-acceptance claim/u);
});

test('ordinary governance reduction preserves required verification and security boundaries', () => {
  for (const text of ordinaryInstructions) {
    assert.match(text, /pnpm pr:verify/u);
    assert.match(text, /pnpm security:guard/u);
  }
  assert.match(agents, /proxy\.ts[^]*read-only unless the owner explicitly authorizes/u);
  assert.match(agents, /Paddle is the only V3 pilot billing provider/u);
  assert.match(program, /Tenant\/RLS and document lifecycle\s+protections remain mandatory/u);
  assert.match(program, /Protected hosted checks remain separate\s+trust evidence/u);
});
