import assert from 'node:assert/strict';
import test from 'node:test';

import { scriptInventory, summarizeScripts } from './next-csp-script-inventory.mjs';

const nonce = 'c2VjMDUtY29uc3RhbnQtbm9uY2U=';

test('script inventory accepts whitespace before script closing tag end', () => {
  const scripts = scriptInventory(`
    <script nonce="${nonce}" src="/_next/static/chunks/main.js"></script >
    <script nonce="${nonce}">window.__ready = true;</script\t>
    <script nonce="${nonce}" src="/edge.js"></script\t
      ignored>
  `);

  assert.equal(scripts.length, 3);
  assert.deepEqual(
    scripts.map(script => ({
      src: script.src,
      nonce: script.nonce,
      inlineLength: script.inlineLength,
      firstParty: script.firstParty,
    })),
    [
      {
        src: '/_next/static/chunks/main.js',
        nonce,
        inlineLength: 0,
        firstParty: true,
      },
      {
        src: null,
        nonce,
        inlineLength: 'window.__ready = true;'.length,
        firstParty: true,
      },
      {
        src: '/edge.js',
        nonce,
        inlineLength: 0,
        firstParty: true,
      },
    ]
  );
});

test('script summary keeps third-party scripts out of first-party nonce counts', () => {
  const scripts = scriptInventory(`
    <script nonce="${nonce}" src="/local.js"></script>
    <script src="https://cdn.example.com/library.js"></script>
    <script src="/missing-nonce.js"></script>
  `);

  assert.deepEqual(summarizeScripts(scripts, nonce), {
    scriptTagCount: 3,
    firstPartyScriptCount: 2,
    missingFirstPartyNonceCount: 1,
    firstMissingFirstPartyScripts: [scripts[2]],
  });
});
