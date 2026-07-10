import assert from 'node:assert/strict';
import test from 'node:test';

import {
  displayDecision,
  displayOption,
  displayRisk,
  displaySeverity,
} from '../public/src/components/display-labels.mjs';

test('maps canonical review enums to Albanian display labels', () => {
  assert.equal(displayDecision('approve'), 'Mirato');
  assert.equal(displayDecision('change'), 'Kërkon ndryshim');
  assert.equal(displayRisk('privacy'), 'Privatësi');
  assert.equal(displaySeverity('high'), 'E lartë');
});

test('returns an Albanian descriptor label without changing its canonical value', () => {
  const descriptor = {
    options: ['allowed', 'excluded'],
    optionLabelsSq: { allowed: 'Lejo', excluded: 'Përjashto' },
  };
  assert.deepEqual(displayOption(descriptor, 'excluded'), {
    label: 'Përjashto',
    value: 'excluded',
  });
});
