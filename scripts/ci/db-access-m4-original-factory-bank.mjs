// Data projection called only after the existing one-use ordinary/native/runtime owners join.
// The three established finite factory rule bodies remain unchanged.
import { deriveFixedFactoryConstruction } from './db-access-m4-factory-source-rule.mjs';
import { deriveFactoryContextDecisions } from './db-access-m4-factory-context-rule.mjs';
import { accountAcceptedFactoryContexts } from './db-access-m4-acceptance-accounting.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
function readFactoryContract() {
  const file = path.join(import.meta.dirname, 'db-access-m4-factory-contract.json');
  if (fs.realpathSync(file) !== file) throw Error('Physical fixed factory contract required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd),
      bytes = fs.readFileSync(fd),
      after = fs.fstatSync(fd),
      current = fs.lstatSync(file);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid() ||
      ![0o644, 0o444].includes(before.mode & 0o7777) ||
      before.size !== 4297 ||
      bytes.length !== 4297 ||
      createHash('sha256').update(bytes).digest('hex') !==
        '0599c16deb90a431fe409160708a5171eecd418aab500be9c1e1c74297aa9295' ||
      ['dev', 'ino', 'size', 'mode', 'uid', 'nlink', 'mtimeMs', 'ctimeMs'].some(
        key => before[key] !== after[key] || after[key] !== current[key]
      )
    )
      throw Error('Fixed factory contract bytes or custody changed');
    return JSON.parse(bytes);
  } finally {
    fs.closeSync(fd);
  }
}
const FIXED = readFactoryContract();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = reason => {
  throw Error('M4 original factory bank refused: ' + reason);
};
export function projectOriginalFactoryBank(native, ordinary, event) {
  const bank = ordinary.originalFactoryBank;
  if (
    bank?.kind !== 'fresh-original-admin-factory-nine' ||
    typeof bank.imageId !== 'string' ||
    !bank.imageId ||
    bank.sourceContext !== JSON.stringify(event.context) ||
    bank.ordinaryArtifactDigest !== ordinary.ordinaryArtifactDigest ||
    bank.sourceBefore !== ordinary.sourceBefore ||
    bank.parentBefore !== ordinary.parentBefore ||
    bank.directFactoryCoverageObserved !== false ||
    bank.productionCCredit !== 0 ||
    bank.nativeAdmission !== false
  )
    fail('fresh same-source/event/artifact bank');
  const construction = deriveFixedFactoryConstruction(bank.execution);
  const decisions = deriveFactoryContextDecisions(native, construction);
  const accounting = accountAcceptedFactoryContexts(native, decisions);
  if (
    !same(accounting.acceptedOriginalIdentities, FIXED.factoryIds) ||
    decisions.some(row => !row.completeIdentityContextConjunction)
  )
    fail('both original factory identities require every actual context');
  return {
    version: 1,
    kind: 'current-original-restored-factory-acceptance',
    sourceCommit: event.context.sourceCommit,
    context: bank.sourceContext,
    imageId: bank.imageId,
    ordinaryArtifactDigest: bank.ordinaryArtifactDigest,
    construction,
    decisions,
    accounting,
    acceptedOriginalIdentities: accounting.acceptedOriginalIdentities,
    originalSelectedTrustedCohortAccepted: false,
    historicalWitnessSource: {
      commit: '2f0225a4e1eec865447ebdf67356dfcf71969fb4',
      tree: '7d1c7663690c2412a47acfa8d48b47115598fd38',
      sourceFile: FIXED.sourceFile,
      sourceSha256: FIXED.pins.originalTest.sha256,
      relation:
        'same exact restored source/operation identities; acceptance uses fresh current native contexts and fresh nine-case owner',
    },
    productionCCredit: 0,
    nativeAdmission: false,
    wholeM4Complete: false,
  };
}
