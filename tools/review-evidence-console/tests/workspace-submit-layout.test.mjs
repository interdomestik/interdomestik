import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { renderWorkspace } from '../public/src/views/workspace.mjs';
import { fakeDocument, walk } from './fake-dom.mjs';
import { bundle, completeDecision } from './review-session-fixtures.mjs';

setDocument(fakeDocument);

test('submit action has dedicated reachable grid placement outside the packet rail', async () => {
  const view = renderWorkspace({
    bundle,
    state: {
      activeItem: 'item_a',
      decisions: Object.fromEntries(
        bundle.packet.itemIds.map(id => [id, structuredClone(completeDecision)])
      ),
    },
    safeEvidenceConfirmed: false,
  });
  const button = walk(view).find(node => node.attributes.class?.includes('workspace-submit'));
  assert.equal(button?.tagName, 'BUTTON');

  const css = await readFile(
    new URL('../public/styles/workspace-submit.css', import.meta.url),
    'utf8'
  );
  assert.match(css, /\.workspace-submit\s*{[^}]*grid-column:\s*2\s*\/\s*-1[^}]*}/s);
  assert.match(css, /\.workspace-submit\s*{[^}]*min-height:\s*44px[^}]*}/s);
  assert.match(
    css,
    /@media \(max-width:\s*680px\)[^{]*{[\s\S]*?\.workspace-submit\s*{[^}]*grid-column:\s*1[^}]*}/
  );
});
