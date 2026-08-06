import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCommandCoverage } from './z620-parity-lib.mjs';
import { gates, parity } from './z620-parity-policy-fixtures.mjs';

test('command parity rejects malformed metadata and unsafe spec paths', () => {
  const cases = [
    [fixture => delete fixture.commandMetadata['check-db-access'], /missing command metadata/u],
    [fixture => (fixture.commandMetadata['check-db-access'].extra = true), /unknown metadata key/u],
    [fixture => (fixture.commandMetadata['check-db-access'].env = []), /env must be an object/u],
    [
      fixture => (fixture.commandMetadata['check-db-access'].projects = {}),
      /projects must be an array/u,
    ],
    [fixture => (fixture.commandMetadata['check-db-access'].specs = {}), /specs must be an array/u],
    [
      fixture => (fixture.commandMetadata['e2e-gate-pr'].projects = ['gate-mk-mk', 'gate-ks-sq']),
      /projects must be sorted and unique/u,
    ],
    [
      fixture => (fixture.commandMetadata['e2e-gate-pr'].specs = ['e2e/gate', 'e2e/gate']),
      /specs must be sorted and unique/u,
    ],
    [fixture => (fixture.commandMetadata['e2e-gate-pr'].specs = ['../escape']), /unsafe spec/u],
  ];
  for (const [mutate, expected] of cases) {
    const fixture = structuredClone(gates);
    mutate(fixture);
    assert.match(validateCommandCoverage(parity, fixture).join('\n'), expected);
  }
});

test('command parity rejects unknown, duplicate and one-way mappings', () => {
  const job = gates.commandCoverage['e2e-gate-pr'][0];
  const cases = [
    [fixture => fixture.substitutableCommands.push('unknown-command'), /unknown gate command/u],
    [fixture => fixture.commandCoverage['e2e-gate-pr'].push(job), /duplicate CI job/u],
    [fixture => (fixture.commandCoverage['e2e-gate-pr'] = []), /missing CI counterpart/u],
    [
      fixture => (fixture.commandCoverage['e2e-gate-pr'] = ['.github\/workflows\/ci.yml#ghost']),
      /unknown or excluded CI job/u,
    ],
    [fixture => delete fixture.jobCoverage[job], /missing forward job coverage/u],
    [
      fixture => (fixture.jobCommands['.github\/workflows\/ci.yml#ghost'] = []),
      /unknown or excluded job commands/u,
    ],
    [
      fixture => fixture.jobCommands[job].push(structuredClone(fixture.jobCommands[job][0])),
      /duplicate command ID/u,
    ],
  ];
  for (const [mutate, expected] of cases) {
    const fixture = structuredClone(gates);
    mutate(fixture);
    assert.match(validateCommandCoverage(parity, fixture).join('\n'), expected);
  }
});
