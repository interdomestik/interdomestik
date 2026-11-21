// WP-02 1b-1 option A, approved by the owner on 2026-11-21. Digests are SHA-256 of the
// guard's syntax fingerprint at 0aeaca0d0, for both calling units and intrinsic captures.
const SAFE_ACTION = 'apps/web/src/lib/safe-action';
const REASON =
  'WP-02 1b-1 (wp02-1b-design.md R8.4/R12.2/D86): call captured intrinsics without ' +
  'dispatching through submitted values or polluted prototypes.';

const capture = (binding, intrinsic, sha256, globals, input) => ({
  binding,
  intrinsic,
  sha256,
  globals,
  input,
});

const formEntries = capture(
  'formEntries',
  'FormData.prototype.entries',
  'c888cb0c3f4f287b9fd5e02879e56f13bdacd957c619ba77c76252bee79b841b',
  ['FormData']
);
const formNext = capture(
  'formNext',
  'FormData entries iterator prototype.next',
  '788593477fc85e73850c6e6daf4f3e13a67f7d1cbc48f7ec2888ecb3a0c341f5',
  ['Object', 'Reflect', 'FormData'],
  formEntries
);

const apply = (suffix, unit, sha256, targets) => ({
  file: `${SAFE_ACTION}.${suffix}.ts`,
  unit,
  operation: 'apply',
  sha256,
  targets,
  reason: REASON,
});

export const LIFETIME_REFLECT_ADMISSIONS = [
  apply(
    'check-def',
    'regexDefinition',
    '2899d16729af3ce1af874855302842ec96f524a2c80e83aa73db54325854592a',
    [
      capture(
        'regExpSource',
        'RegExp.prototype.source getter',
        'd5914b2cacceb35e6ed0f81152790b2a533bf1cefe9ce5da3d7d8687ae01d327',
        ['Object', 'RegExp']
      ),
      capture(
        'regExpFlags',
        'RegExp.prototype.flags getter',
        '4dcebaaa9e453a5e5eaf96b4687e17bbc09d65abddd0a351f9c377f9eebb6c8b',
        ['Object', 'RegExp']
      ),
    ]
  ),
  apply('guard', 'formNext', formNext.sha256, [formEntries]),
  apply(
    'guard',
    'collectForm',
    'd71b52e7abd4d61fd24f9167479194ddca64aba9b8b17cdc5f1575b098ca8e9f',
    [formEntries, formNext]
  ),
  apply(
    'output',
    'privateFile',
    'ba90b638718b3f14180400ad9c7efbd0cfa8f641cba66ce86db79436fed0ca7c',
    [
      capture(
        'blobSize',
        'Blob.prototype.size getter',
        '0c0912c09b49ee45b7f4d34ae182f291aee995deb87974dfa662e46fee5760c4',
        ['Object', 'Blob']
      ),
      capture(
        'fileName',
        'File.prototype.name getter',
        '812275ad5655d49f82b04b8add4670df4a7e8b1532578063a239f80f0fa9e2a1',
        ['Object', 'File']
      ),
      capture(
        'blobType',
        'Blob.prototype.type getter',
        '01eb65005dea213fe133f4c86ec3430b0e54ed230c9788241084b8a0a71a3d60',
        ['Object', 'Blob']
      ),
      capture(
        'fileTime',
        'File.prototype.lastModified getter',
        '19987c814a94fea1f7648f76099f63502dd5afd8b0ce5608cf9e4e615cc2743f',
        ['Object', 'File']
      ),
      capture(
        'blobBytes',
        'Blob.prototype.arrayBuffer',
        'a033c5db11898219514001007fb5236eaafb03149232293b3ad6731e84225804',
        ['Blob']
      ),
    ]
  ),
  apply(
    'refusal',
    'readRawValue',
    '0d9846b99c5047539c8b383cc92bd6d7cfc9959486e8de648302af73201e99b2',
    [
      capture(
        'formGetAll',
        'FormData.prototype.getAll',
        '5b32fc337cbcdca4f597b09decd342649b43737aa61aab753fe2a4853669a50c',
        ['FormData']
      ),
    ]
  ),
];
