import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { boundedReviewFrame } from './run-model-reviewer-route.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const AUTHORITY = ['AGENTS.md', 'code_review.md', 'docs/plans/current-program.md'];
const DIFF_LIMIT = /review candidate diff exceeds the bounded packet limit/u;
const FRAME_LIMIT = /combined review authority exceeds the bounded packet limit/u;
const MAX_FRAME_BYTES = 256 * 1024;

const authorityText = (file, padding = {}) =>
  `Authority ${file}\n${'a'.repeat(padding[file] ?? 0)}`;
// Frame entries as the route builds them: trimmed text, "# <file>" heading, "\n\n" separators.
const frameEntries = padding =>
  AUTHORITY.map(filePath => ({ filePath, text: authorityText(filePath, padding).trim() }));
const frameBytes = padding =>
  Buffer.byteLength(
    frameEntries(padding)
      .map(e => `# ${e.filePath}\n${e.text}`)
      .join('\n\n')
  );
const programPaddingForFrame = bytes => bytes - frameBytes({ [AUTHORITY[2]]: 1 }) + 1;
const programPaddingForFile = bytes => bytes - Buffer.byteLength(authorityText(AUTHORITY[2]));
const FILE_LIMIT = /review authority file exceeds the bounded packet limit/u;

test('exact combined-frame boundary includes headings and separators', () => {
  const atLimit = { [AUTHORITY[2]]: programPaddingForFrame(MAX_FRAME_BYTES) };
  const overLimit = { [AUTHORITY[2]]: programPaddingForFrame(MAX_FRAME_BYTES + 1) };
  assert.equal(frameBytes(atLimit), MAX_FRAME_BYTES);
  assert.equal(Buffer.byteLength(boundedReviewFrame(frameEntries(atLimit))), MAX_FRAME_BYTES);
  assert.equal(frameBytes(overLimit), MAX_FRAME_BYTES + 1);
  assert.ok(Buffer.byteLength(authorityText(AUTHORITY[2], overLimit)) < MAX_FRAME_BYTES);
  assert.throws(() => boundedReviewFrame(frameEntries(overLimit)), FRAME_LIMIT);
});

for (const [bytes, accepted, padding = {}, rejection = DIFF_LIMIT] of [
  [650_000, true],
  [1_048_000, true],
  [1_100_000, false],
  [1_000, true, { [AUTHORITY[2]]: 200_000 }],
  [1_000, false, { [AUTHORITY[2]]: 270_000 }, /authority file exceeds the bounded packet limit/u],
  [
    1_000,
    false,
    { [AUTHORITY[0]]: 140_000, [AUTHORITY[2]]: 140_000 },
    /combined review authority exceeds the bounded packet limit/u,
  ],
  [1_000, true, { [AUTHORITY[2]]: programPaddingForFrame(MAX_FRAME_BYTES) }],
  [1_000, false, { [AUTHORITY[2]]: programPaddingForFrame(MAX_FRAME_BYTES + 1) }, FRAME_LIMIT],
  // Pin the per-file constant: a file of exactly 256 KiB passes the per-file check and is then
  // rejected by the aggregate frame; one byte more is rejected by the per-file check itself.
  [1_000, false, { [AUTHORITY[2]]: programPaddingForFile(256 * 1024) }, FRAME_LIMIT],
  [1_000, false, { [AUTHORITY[2]]: programPaddingForFile(256 * 1024 + 1) }, FILE_LIMIT],
]) {
  const sizes = Object.entries(padding).map(([file, size]) => `${file} +${size}B`);
  const label = sizes.length ? ` with ${sizes.join(', ')} authority` : '';
  test(`Opus transports a complete ${bytes}-byte candidate${label} or rejects before provider start`, () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-packet-'));
    const git = (...args) => execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' }).trim();
    try {
      git('init', '-q');
      fs.mkdirSync(path.join(cwd, 'docs/plans'), { recursive: true });
      for (const file of AUTHORITY)
        fs.writeFileSync(path.join(cwd, file), authorityText(file, padding));
      git('add', '.');
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '-qm',
        'base'
      );
      const baseSha = git('rev-parse', 'HEAD');
      git('update-ref', 'refs/remotes/origin/main', baseSha);
      fs.writeFileSync(
        path.join(cwd, 'snapshot.json'),
        JSON.stringify({ complete: 'x'.repeat(bytes) })
      );
      git('add', '.');
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '-qm',
        'candidate'
      );
      const diff = execFileSync(
        '/usr/bin/git',
        ['diff', '--no-ext-diff', '--unified=3', 'origin/main...HEAD'],
        { cwd, encoding: 'utf8', maxBuffer: 2_000_000 }
      );
      fs.writeFileSync(path.join(cwd, 'expected-diff'), diff);
      fs.mkdirSync(path.join(cwd, 'bin'));
      fs.writeFileSync(
        path.join(cwd, 'bin/claude'),
        `#!${process.execPath}\n
        const fs = require('node:fs');
        fs.writeFileSync('provider-started', 'yes');
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => input += chunk);
        process.stdin.on('end', () => console.log(JSON.stringify({
          model: 'claude-opus-5', result: 'VERDICT: PASS',
          complete: input.includes(fs.readFileSync('expected-diff', 'utf8')),
          authority: ['AGENTS.md', 'code_review.md', 'docs/plans/current-program.md'].every(file => input.includes('Authority ' + file)),
          authorityContent: ['AGENTS.md', 'code_review.md', 'docs/plans/current-program.md'].every(file => input.includes(fs.readFileSync(file, 'utf8').trim())),
          modelArg: process.argv[process.argv.indexOf('--model') + 1],
          toolsArg: process.argv[process.argv.indexOf('--tools') + 1],
          slashDisabled: process.argv.includes('--disable-slash-commands'),
          boundedArgs: process.argv.join(' ').length < 1000
        })));
      `,
        { mode: 0o700 }
      );
      const result = spawnSync(
        process.execPath,
        [
          path.join(scriptDir, 'run-model-reviewer-route.mjs'),
          '--route',
          'opus',
          '--allow-escalation',
        ],
        {
          cwd,
          encoding: 'utf8',
          env: { ...process.env, PATH: `${path.join(cwd, 'bin')}:${process.env.PATH}` },
          timeout: 10_000,
        }
      );
      assert.equal(result.status, accepted ? 0 : 125, result.stderr || result.stdout);
      const summary = JSON.parse(result.stdout);
      const receipt = JSON.parse(fs.readFileSync(summary.receipt.jsonPath, 'utf8'));
      assert.equal(fs.existsSync(path.join(cwd, 'provider-started')), accepted);
      if (accepted) {
        assert.equal(receipt.status, 'ran');
        assert.equal(receipt.providerReportedModel, 'claude-opus-5');
        assert.equal(receipt.reviewVerdict, 'PASS');
        assert.deepEqual(receipt.candidateIdentity, {
          baseSha,
          headSha: git('rev-parse', 'HEAD'),
          treeSha: git('rev-parse', 'HEAD^{tree}'),
          diffSha256: createHash('sha256').update(diff).digest('hex'),
        });
        const delivered = JSON.parse(receipt.stdout);
        assert.equal(delivered.complete, true);
        assert.equal(delivered.authority, true);
        assert.equal(delivered.authorityContent, true);
        assert.deepEqual(
          [delivered.modelArg, delivered.toolsArg, delivered.slashDisabled],
          ['claude-opus-5', '', true]
        );
        assert.equal(delivered.boundedArgs, true);
      } else {
        assert.equal(receipt.blockerReason, 'reviewer_packet_preparation');
        assert.match(receipt.error, rejection);
        assert.equal(receipt.reviewVerdict, null);
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
}
