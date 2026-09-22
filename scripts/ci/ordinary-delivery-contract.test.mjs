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

const instructions = [
  section(read('AGENTS.md'), '## Normal Delivery'),
  section(read('docs/plans/current-program.md'), '## Ordinary Product Delivery'),
  section(
    read('docs/plans/current-tracker.md'),
    '### Ordinary delivery governance reduction (2026-09-22)'
  ),
];

test('ordinary entry instructions retain coarse limits without exact accounting admission', () => {
  for (const text of instructions) {
    assert.match(text, /repo:size:check/u);
    assert.match(text, /total\/category bytes, file count and source-line growth as advisory/u);
    assert.match(text, /coarse largest-file cap.{0,30}blocking/u);
    assert.match(text, /no exact allocations, budget updates or byte-specific approval/u);
    assert.match(text, /explicitly invoked legacy workflows/u);
    assert.match(text, /other safety, build, security and modularity limits remain in force/u);
  }
});

test('canonical bookkeeping does not create a second PR or authorized-successor gate', () => {
  for (const text of instructions) {
    assert.match(text, /product PR/u);
    assert.match(text, /next authorized amendment/u);
    assert.match(text, /status-only PR/u);
    assert.match(text, /(?:do not|does not) (?:create.{0,50}or )?block an authorized successor/iu);
    assert.match(text, /(?:actual unresolved|unresolved) scope, security and release blockers/iu);
  }
  const completion = read('docs/plans/current-program.md').match(
    /Owner-approved completion rule[^]*?(?=\n### )/u
  )?.[0];
  assert.ok(completion);
  assert.match(completion, /pending canonical bookkeeping alone does not\s+block/u);
  assert.match(completion, /Pre-merge records say awaiting merge/u);
});

test('ordinary governance reduction preserves required verification and security boundaries', () => {
  for (const text of instructions.slice(1)) {
    assert.match(text, /pnpm pr:verify/u);
    assert.match(text, /pnpm security:guard/u);
    assert.match(text, /E2E evidence/u);
  }
  const agents = read('AGENTS.md');
  assert.match(agents, /proxy\.ts[^\n]*READ-ONLY unless explicitly authorized/u);
  assert.match(agents, /Paddle-only V3 pilot billing/u);
  assert.match(instructions[1], /tenant\/auth\/RLS, document lifecycle, data integrity/u);
  assert.match(instructions[1], /protected expected-head merges/u);
});
