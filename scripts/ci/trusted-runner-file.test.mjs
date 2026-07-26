import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  appendTrustedRunnerFile,
  readTrustedRunnerFile,
  trustedRunnerFile,
} from './trusted-runner-file.mjs';

function tempRoot(prefix = 'trusted-runner-file-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('returns canonical existing and not-yet-created files inside RUNNER_TEMP', () => {
  const root = tempRoot();
  const existing = path.join(root, 'event.json');
  fs.writeFileSync(existing, '{}');

  assert.equal(trustedRunnerFile(existing, { runnerTemp: root }), fs.realpathSync(existing));
  assert.equal(
    trustedRunnerFile(path.join(root, 'nested', 'output.txt'), { runnerTemp: root }),
    path.join(fs.realpathSync(root), 'nested', 'output.txt')
  );
});

test('requires a non-empty existing RUNNER_TEMP directory', () => {
  const root = tempRoot();

  assert.throws(() => trustedRunnerFile(path.join(root, 'event.json'), { runnerTemp: '' }), {
    message: 'trusted runner root is required',
  });
  assert.throws(
    () =>
      trustedRunnerFile(path.join(root, 'event.json'), {
        runnerTemp: path.join(root, 'missing'),
      }),
    { message: 'trusted runner root is invalid' }
  );
});

test('rejects separator-prefix siblings outside the trusted root', () => {
  const parent = tempRoot();
  const root = path.join(parent, 'runner');
  const sibling = path.join(parent, 'runner-escape');
  fs.mkdirSync(root);
  fs.mkdirSync(sibling);
  const candidate = path.join(sibling, 'event.json');
  fs.writeFileSync(candidate, '{}');

  assert.throws(() => trustedRunnerFile(candidate, { runnerTemp: root }), {
    message: 'runner file is outside the trusted root',
  });
});

test('rejects symlinks and paths beneath a symlink', () => {
  const root = tempRoot();
  const outside = tempRoot('trusted-runner-outside-');
  const inside = path.join(root, 'inside');
  const target = path.join(outside, 'event.json');
  const directLink = path.join(root, 'event-link.json');
  const directoryLink = path.join(root, 'linked-directory');
  const insideLink = path.join(root, 'inside-link');
  fs.mkdirSync(inside);
  fs.writeFileSync(target, '{}');
  fs.symlinkSync(target, directLink);
  fs.symlinkSync(outside, directoryLink);
  fs.symlinkSync(inside, insideLink);

  assert.throws(() => trustedRunnerFile(directLink, { runnerTemp: root }), {
    message: 'runner file symlinks are not allowed',
  });
  assert.throws(
    () => trustedRunnerFile(path.join(directoryLink, 'missing.json'), { runnerTemp: root }),
    { message: 'runner file symlinks are not allowed' }
  );
  assert.throws(
    () => trustedRunnerFile(path.join(insideLink, 'missing.json'), { runnerTemp: root }),
    { message: 'runner file symlinks are not allowed' }
  );
});

test('rejects existing hard-linked and non-regular files', () => {
  const root = tempRoot();
  const source = path.join(root, 'source.json');
  const hardLink = path.join(root, 'event.json');
  const directory = path.join(root, 'directory');
  fs.writeFileSync(source, '{}');
  fs.linkSync(source, hardLink);
  fs.mkdirSync(directory);

  assert.throws(() => trustedRunnerFile(hardLink, { runnerTemp: root }), {
    message: 'runner file must have exactly one hard link',
  });
  assert.throws(() => trustedRunnerFile(directory, { runnerTemp: root }), {
    message: 'runner file must be regular',
  });
});

test('reads and appends through the validated descriptor', () => {
  const root = tempRoot();
  const file = path.join(root, 'runner.txt');
  fs.writeFileSync(file, 'first');

  assert.equal(readTrustedRunnerFile(file, { runnerTemp: root }), 'first');
  appendTrustedRunnerFile(file, '-second', { runnerTemp: root });
  assert.equal(fs.readFileSync(file, 'utf8'), 'first-second');
});

test('rejects an ancestor replaced after path validation', () => {
  const root = tempRoot();
  const outside = tempRoot('trusted-runner-outside-');
  const directory = path.join(root, 'nested');
  const movedDirectory = path.join(root, 'nested-safe');
  const file = path.join(directory, 'event.json');
  fs.mkdirSync(directory);
  fs.writeFileSync(file, '{}');
  fs.writeFileSync(path.join(outside, 'event.json'), '{"outside":true}');

  const originalOpenSync = fs.openSync;
  fs.openSync = function swapBeforeOpen(filePath, flags, mode) {
    fs.renameSync(directory, movedDirectory);
    fs.symlinkSync(outside, directory);
    fs.openSync = originalOpenSync;
    return originalOpenSync(filePath, flags, mode);
  };

  try {
    assert.throws(() => readTrustedRunnerFile(file, { runnerTemp: root }), {
      message: /runner file (?:symlinks are not allowed|is outside the trusted root)/,
    });
  } finally {
    fs.openSync = originalOpenSync;
  }
});
