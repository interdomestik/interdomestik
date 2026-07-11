import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

export const expectedRequestedChanges = {
  'M03A-PRIVACY-OWNER':
    'Kontrollo rolin e Gazmend Abazit dhe evidencën e pronarit; ndrysho ose blloko nëse nuk përputhen.',
  'M03A-MEDICAL-BOUNDARY':
    'Mbaji të dhënat mjekësore dhe të lëndimeve të çaktivizuara derisa të ketë autoritet të nënshkruar DPIA/Neni 9.',
  'M03A-CONSENT-FIELDS':
    'Kufizo fushat te statusi, data dhe versioni i pëlqimit; çdo shtesë kërkon autoritet të ri.',
  'M03A-ACCESS-ROLES':
    'Lejo vetëm rolet e mostrës dhe përjashto sponsorin, paguesin dhe palët e jashtme pa autoritet të ri.',
  'M03A-DOCUMENT-BOUNDARY':
    'Shfaq vetëm metadata të lejuara dhe mos shfaq dokumentin burimor ose kategoritë e ndaluara.',
  'M03A-THREAT-RECHECK':
    'Ndalo promovimin derisa rikontrolli i qasjes, ruajtjes dhe zbulimit të ketë evidencë të pranueshme.',
  'M03A-ERASURE-REVOCATION':
    'Fshih metadatat pas fshirjes ose revokimit; çdo gjendje e dukshme kërkon rregull të dokumentuar ruajtjeje.',
  'M03A-SCOPE-STOPS':
    'Kufizo fushën te metadata jo-mjekësore për automjet dhe pronë; ndalo kur mungon autoriteti ose zgjerohet fusha.',
};

async function loadRawItems() {
  const directory = new URL('../public/data/items/', import.meta.url);
  const files = (await readdir(directory)).filter(file => /^m03a-.*\.json$/u.test(file));
  return Promise.all(files.map(async file => JSON.parse(await readFile(new URL(file, directory), 'utf8'))));
}

test('ships exact Albanian requested-change and conditional recommendations', async () => {
  const items = await loadRawItems();
  const find = id => items.find(item => item.id === id);
  for (const [id, requestedChange] of Object.entries(expectedRequestedChanges)) {
    assert.equal(find(id).suggestedReview.requestedChange, requestedChange);
  }
  assert.deepEqual(find('M03A-ERASURE-REVOCATION').suggestedReview.conditionalResponses, {
    retentionNote:
      'Shfaq vetëm statusin e revokuar dhe afatin e dokumentuar të ruajtjes; mos shfaq metadata të tjera.',
  });
  for (const item of items.filter(({ id }) => id !== 'M03A-ERASURE-REVOCATION')) {
    assert.equal(Object.hasOwn(item.suggestedReview, 'conditionalResponses'), false);
  }
});
