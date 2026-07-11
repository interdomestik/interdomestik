import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import { renderWorkspace } from '../public/src/views/workspace.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';

setDocument(fakeDocument);

const headings = new Map([
  ['M03A-PRIVACY-OWNER', 'Autoriteti ligjor dhe ndarja e roleve'],
  ['M03A-MEDICAL-BOUNDARY', 'Kufiri i të dhënave mjekësore'],
  ['M03A-CONSENT-FIELDS', 'Fushat minimale të pëlqimit'],
  ['M03A-ACCESS-ROLES', 'Rolet me qasje'],
  ['M03A-DOCUMENT-BOUNDARY', 'Kufiri i dokumenteve'],
  ['M03A-THREAT-RECHECK', 'Rikontrolli i kërcënimeve'],
  ['M03A-ERASURE-REVOCATION', 'Fshirja dhe revokimi'],
  ['M03A-SCOPE-STOPS', 'Fusha dhe kushtet e ndalimit'],
]);

test('renders all eight Albanian headings beside unchanged copyable IDs', async () => {
  const repository = createFixtureRepository();
  const bundles = await Promise.all(
    ['assign_mob03a_part_a', 'assign_mob03a_part_b'].map(id => repository.loadAssignmentBundle(id))
  );
  for (const { value: bundle } of bundles) {
    for (const item of bundle.packet.items) {
      const view = renderWorkspace({
        bundle,
        state: stateFor(bundle, item.id),
        safeEvidenceConfirmed: false,
      });
      const heading = walk(view).find(node => node.attributes.id === 'item-heading');
      const canonical = walk(view).find(
        node => node.attributes.class === 'canonical-id' && copy(node).trim() === item.id
      );
      assert.equal(copy(heading).trim(), headings.get(item.id));
      assert.equal(copy(canonical).trim(), item.id);
    }
  }
});

test('renders Albanian enum labels before canonical English audit codes', async () => {
  const repository = createFixtureRepository();
  const { value: bundle } = await repository.loadAssignmentBundle('assign_mob03a_part_a');
  const view = renderWorkspace({
    bundle,
    state: stateFor(bundle, bundle.packet.itemIds[1], true),
    safeEvidenceConfirmed: true,
  });
  const codes = walk(view).filter(node => node.tagName === 'CODE');
  assert.ok(codes.length >= 3);
  assert.ok(codes.every(node => node.attributes.lang === 'en'));
  assert.match(copy(view), /Mirato.*approve/s);
  assert.match(copy(view), /Përjashto.*excluded/s);
  assert.match(copy(view), /E lartë.*high/s);
});

test('explains that suggested notes remain editable and removable', async () => {
  const repository = createFixtureRepository();
  const { value: bundle } = await repository.loadAssignmentBundle('assign_mob03a_part_a');
  const view = renderWorkspace({
    bundle,
    state: stateFor(bundle, bundle.packet.itemIds[0]),
    safeEvidenceConfirmed: false,
  });
  assert.match(
    copy(view),
    /Disa shënime janë sugjeruar për ta përshpejtuar shqyrtimin; mund t’i ndryshoni ose t’i hiqni\./
  );
});

function stateFor(bundle, activeItem, selected = false) {
  return {
    activeItem,
    decisions: Object.fromEntries(
      bundle.packet.items.map(item => [
        item.id,
        {
          decision: selected ? 'approve' : null,
          concreteAnswer: '',
          reason: '',
          evidenceRef: '',
          verifiedAt: '',
          riskCategory: selected ? item.allowedRiskCategories[0] : '',
          severity: selected ? 'high' : '',
          requestedChange: '',
          responses: selected ? { medicalBoundary: 'excluded' } : {},
        },
      ])
    ),
  };
}
