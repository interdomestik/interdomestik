import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const verificationAgent = readFileSync(
  new URL('../multi-agent/verification-agent.sh', import.meta.url),
  'utf8'
);

test('verification agent clears only port 3000 listeners', () => {
  assert.match(verificationAgent, /remediation=clear-port-3000/);
  assert.match(verificationAgent, /lsof -tiTCP:3000 -sTCP:LISTEN/);
  assert.match(verificationAgent, /remaining="\$\(lsof -tiTCP:3000 -sTCP:LISTEN/);
  assert.match(verificationAgent, /xargs kill -9/);
  assert.match(verificationAgent, /fi; true'/);
  assert.doesNotMatch(verificationAgent, /lsof -ti\s+:3000/);
});
