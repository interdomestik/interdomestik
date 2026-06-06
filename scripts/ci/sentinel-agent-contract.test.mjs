import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SENTINEL_AGENT = path.join(REPO_ROOT, 'scripts/multi-agent/sentinel-agent.sh');

test('sentinel agent preserves caller Node PATH for nested commands', () => {
  const source = fs.readFileSync(SENTINEL_AGENT, 'utf8');

  assert.match(source, /PATH_WITH_NODE="\$PATH"/);
  assert.match(source, /env PATH="\$PATH_WITH_NODE" bash -c "cd '\$ROOT_DIR' && \$command"/);
  assert.doesNotMatch(source, /run_redacted "\$log_file" bash -lc/);
  assert.match(source, /ACTIVE_NODE_VERSION=/);
  assert.ok(
    source.includes('echo "- node: \\`${ACTIVE_NODE_VERSION} (${ACTIVE_NODE_BIN:-unknown})\\`"')
  );
});
