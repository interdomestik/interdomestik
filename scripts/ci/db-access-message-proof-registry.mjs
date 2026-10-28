import path from 'node:path';

// LOCAL V2 COMPATIBILITY REGISTRY for the S8 message proof family only. It is not the
// unfinished general changed-effect acceptance rule and admits nothing by itself: the
// protected policy bytes, exact source bytes and a fresh fixed-producer run must all agree.
const DIR = 'packages/domain-communications/src/messages/';
export const MESSAGE_FIXTURE = DIR + 'tenant-context.integration-fixture.ts';
export const MESSAGE_REPLY_RUNTIME = DIR + 'public-reply-concurrency.runtime-fixture.ts';
export const MESSAGE_REPLY_WORKER = DIR + 'public-reply-concurrency.worker-fixture.ts';
const SAFETY = DIR + 'tenant-context-safety.test.ts';
const TENANT = DIR + 'tenant-context.integration.test.ts';
const AGENT = DIR + 'agent-context.integration.test.ts';
const REPLY = DIR + 'public-reply-notification.integration.test.ts';
const AUDIT = 'apps/web/src/actions/messages/audit.rls.integration.test.ts';

export const MESSAGE_PROOF_CONTRACT = Object.freeze({
  id: 's8-message-integration-proof-v2',
  version: 2,
  compatibility: 'local-finite-message-family-v2',
  requiredTests: 20,
});
// Unchanged finite bound. Growth needs an exact reviewed source list, never silent widening.
export const MESSAGE_CLOSURE_LIMIT = 128;
export const MESSAGE_PRIVATE_FILES = Object.freeze([
  MESSAGE_FIXTURE,
  TENANT,
  AGENT,
  REPLY,
  SAFETY,
  MESSAGE_REPLY_RUNTIME,
  MESSAGE_REPLY_WORKER,
  AUDIT,
]);
// The only executable private-to-private import edges; all other consumers stay ordinary.
export const MESSAGE_PRIVATE_EDGES = Object.freeze({
  [MESSAGE_FIXTURE]: Object.freeze([MESSAGE_REPLY_RUNTIME]),
  [TENANT]: Object.freeze([MESSAGE_FIXTURE]),
  [AGENT]: Object.freeze([MESSAGE_FIXTURE]),
  [REPLY]: Object.freeze([MESSAGE_FIXTURE]),
  [SAFETY]: Object.freeze([MESSAGE_FIXTURE]),
  [MESSAGE_REPLY_RUNTIME]: Object.freeze([]),
  [MESSAGE_REPLY_WORKER]: Object.freeze([]),
  [AUDIT]: Object.freeze([MESSAGE_FIXTURE]),
});
// Files the reply fixture executes without importing: the pinned full tsx loader and worker.
export const MESSAGE_TSX_LOADER = 'node_modules/tsx/dist/loader.mjs';
export const MESSAGE_MODULE_URLS = Object.freeze({
  [MESSAGE_REPLY_RUNTIME]: Object.freeze([
    '../../../../node_modules/tsx/dist/loader.mjs',
    './public-reply-concurrency.worker-fixture.ts',
  ]),
});
// Authenticated configuration only; never an executable model node.
export const MESSAGE_WEB_CONFIG = 'apps/web/vitest.messages-rls.config.ts';

const DOMAIN_LANE = Object.freeze({
  cwd: 'packages/domain-communications',
  config: 'vitest.config.ts',
  configSha256: 'bc4fef5742728a4b402c8d029e71fbf1569191904b419c7c20f9722d688a1d5f',
});
// Dedicated Node lane: no web default setup mocks or database URL overrides.
const WEB_LANE = Object.freeze({
  cwd: 'apps/web',
  config: 'vitest.messages-rls.config.ts',
  configSha256: '2480f72a350fa2d61c21e66ede7784ea32036b190a80d5653dc71258280274a7',
});
// One fresh Vitest CLI per file: each role fixture replaces global clients and DB_RLS_ROLE.
export const MESSAGE_RUNS = Object.freeze(
  [
    [SAFETY, DOMAIN_LANE],
    [TENANT, DOMAIN_LANE],
    [AGENT, DOMAIN_LANE],
    [REPLY, DOMAIN_LANE],
    [AUDIT, WEB_LANE],
  ].map(([file, lane]) =>
    Object.freeze({
      file,
      ...lane,
      configFile: lane.cwd + '/' + lane.config,
      testPath: file.slice(lane.cwd.length + 1),
    })
  )
);

const SQL = 'actual-restricted-postgres';
const FAMILY = [
  [
    SAFETY,
    '62b7e760bc0ece72604bb568c3f7f2cc65d0d00a622de6b6b21d940e8ba3f17f',
    'source-target-safety',
    [
      [
        'message fixture database safety accepts the synthetic CI and task ports without a machine-specific port constraint',
        '5c0370aeb8b6342f56096692ba6ec2c511e4a3ebbabd1736ba1bf58f7526fee1',
        '9acb76b67c182d4b47aac6a6234a6dbb30a9662eef917c773c9c0d5c3d874e9a',
      ],
      [
        'message fixture database safety rejects remote and non-synthetic databases before creating clients or fixtures',
        '5c988bbfce25efdc8a02986e098ab29462fc56c21fa3b3d0fc2bb8590b572b6f',
        '550351254e557c9885d31583d18c97bec2013557489d75fc72d79a52e09180eb',
      ],
      [
        'message fixture database safety rejects connection-string options that could redirect the approved target',
        'c1471d5d740817dc357616c77d101a6139336848fceeacf2701b7f6f0ec01304',
        'cbabfa59c917469a4ee96816f59dd3ba95c47d74ca7ee1f5a010a7d4f07403ca',
      ],
    ],
  ],
  [
    TENANT,
    '8131efb3e27f4dee62778b7ae30fe314a787c4387869f1374d794522d728403a',
    SQL,
    [
      [
        'message operations on a real NOBYPASSRLS connection loads the owned public thread and sender projection across repeated reads',
        '1200287f8961c1182ad2ef6632b877cec5033455f67d8a022d9ff8244bbba9d3',
        '320cd4f95cbb658bf88420c695836370b68383d3e61e9dcb2b3f8c8c5c25121f',
      ],
      [
        'message operations on a real NOBYPASSRLS connection preserves member/tenant denial, staff assignment and linked-agent visibility',
        'bf99ed99f1de1718d15e43d208b4fe1930b77bf6eab8db85b158f52f2cca5aa0',
        '2b622eaf349561b5d3375117808868faf3760a2cab99af59e8bafbc94b4fe3c3',
      ],
      [
        'message operations on a real NOBYPASSRLS connection persists visible recipient receipts while rejecting internal/own/out-of-scope mutations',
        'df188557e2f8368f462862d4b380aa3108ba4070d160c840dfe936497b24368a',
        '3599123556b3fd125db3e9a9f523bde36cceea215a07be30d0706b7e2cb36b1a',
      ],
      [
        'message operations on a real NOBYPASSRLS connection sends a persisted public message with the same transaction and denies member internal send',
        '086e129181bcf5e26802ec752bd099358dbc059b3d7b424140bbb47a2936ce70',
        '880e61acd9b81f4c1647f66ab900400a9b56627b243d9ecc5e5f18ee2010d6c9',
      ],
      [
        'message operations on a real NOBYPASSRLS connection rolls back the insert when the created-message projection is unavailable',
        '206e178236aeed45860dbf6a124d8577b5955dc9fbf478edf362d99de1bac693',
        '3ac8b28a7ee3747203c5205c3d5d7103c159429e6e662aa14a63c596d40fa613',
      ],
      [
        'message operations on a real NOBYPASSRLS connection returns the committed message after a post-commit audit failure without holding the transaction',
        '446cf670a1b305bbb8d4e8bc18f08b5dbaa3c0dac46b3e7ed307edae89560220',
        '1923dac23a3490feb0df7f1a1730e75c3bb9d57ce408c529b71f3f81ad6e07a1',
      ],
    ],
  ],
  [
    AGENT,
    'b3ac88792b24360bf56dfc94f9331b9a1326828d47579caad346425829fbd4f0',
    SQL,
    [
      [
        'message operations on a real NOBYPASSRLS connection uses the current agent branch for read, send and receipts despite a cached null branch',
        '5dc7776a89295b1f2fad93515b7da7febf5472d3c09ae4938351b608445f987e',
        '333afe6ec8b0a5eec34c5904b4f0296850aff499dccd4a52bf1e633fd38317c7',
      ],
      [
        'message operations on a real NOBYPASSRLS connection denies conversation operations when the agent has no current identity in the access tenant',
        'a97158fbb35a8c69508e09a46789728f24fb798283d0d8bef217d6ed53327237',
        'e24081797102ea61adde3b1d1f4b192ee051604d12500198ab4b71d1138d4930',
      ],
      [
        'message operations on a real NOBYPASSRLS connection retains the legitimate current-null-branch agent policy across conversation operations',
        '2e29ada7cf40cec74fd863d2a1b79f545f8dc44ddf4409c505f84f505f2276ce',
        'f1377b7e45f586347c051d422737daf2087ac57674da585a04b318baa26917e4',
      ],
    ],
  ],
  [
    REPLY,
    '177719073d59e1908199fd809715a7357a88a73c5ae3f3f4fa8b5363a1d7a148',
    SQL,
    [
      [
        'S8 public reply under an actual restricted LOGIN keeps session and effective identities restricted, nonowning and without memberships',
        '596f4622f0e22488f56fbd4b2f1a8fa4d6ad4f320279461787f775f361f32478',
        'dd9e5b422a933fcceeb3381541d8ed6812e57a82e74cde91c20bdbcc15c24b9f',
      ],
      [
        'S8 public reply under an actual restricted LOGIN persists one recipient notification and an immutable data-only delivery plan',
        '3d52ffec1c6d7149fb480b12ec5302afb0ebce4a0f3340ad08f9c79efb3efd42',
        '667af6fa8e52e10c0e4fa59f57a204c875f4dc1321ce50d9f509b83d80aa8038',
      ],
      [
        'S8 public reply under an actual restricted LOGIN deduplicates simultaneous actual preparation calls on two restricted database sessions',
        '014382ce749e2a8dc768a4587f9cdd9bb01f6601e9fd3dfcc917a40c79c7d8cf',
        '97eb111c0e4ef9d68d29ea2cc855413c1847c730679cf2abf7ef73541b6917be',
      ],
      [
        'S8 public reply under an actual restricted LOGIN rejects mismatched recipient, message visibility, sender and tenant without notification writes',
        'e4d6be28a7eeef8489bc14ca8dcca051660652117f9a38efa7ac392201b57a97',
        'acee36b4fc6e5afc994ee1d2b238a1580ff742d8a69cc03b814690caa2601692',
      ],
      [
        'S8 public reply under an actual restricted LOGIN rolls back a denied notification insert while preserving its already committed message',
        '5fbec7919e3aedbf69b2be99581568ad07bafef68372bfe660a502f6e3a2fbba',
        'e97ce0eacc480d6c296029af7decceeb3ad17a2615ac430da4027ff01c0183ac',
      ],
      [
        'S8 public reply under an actual restricted LOGIN isolates subscription reads and expired endpoint cleanup by recipient, tenant and admitted endpoints',
        '8c7840704b6a6daf6dffd962b967a4f95bcd2760c560ba2361c89270f5f3b539',
        'bbf9aa281979b2e5048b89a3db9b14133a557a380d6e7721197ec5f443a87cb6',
      ],
    ],
  ],
  [
    AUDIT,
    '82d63e0784522a59120e525b3065706db866110dda28205b2c90c64d7ace05b8',
    SQL,
    [
      [
        'actual S8 message audit adapter reads staff assignment options with the actual restricted tenant context',
        '818ee38b5ea916a478bd89b032dcb30da87660809082be3f017a1eccceff0843',
        '02e36a6d4f0f1d760e663156823b8e45808c0d9b97fd45e2152fc6d636c6d372',
      ],
      [
        'actual S8 message audit adapter persists a tenant-bound audit through the actual restricted post-commit adapter',
        '0ad9cbb96f38aac16eab5280ed7fbb137c28c2792dacebcc71a5d95ed1daac7c',
        '3329178f9ebb29a185812a7ebf2d10c721cc176b2c56b5a206f0e1653a00e404',
      ],
    ],
  ],
];
// Case/body digests are carried identity data. The bound file digest already fixes every body.
export const MESSAGE_CASES = Object.freeze(
  FAMILY.flatMap(([file, fileSha256, kind, cases]) =>
    cases.map(([fullName, caseSha256, bodySha256]) =>
      Object.freeze({ file, fullName, fileSha256, caseSha256, bodySha256, kind })
    )
  )
);

export const messageCaseIdentities = () =>
  MESSAGE_CASES.map(({ file, fullName }) => ({ file, fullName }));
export const messageUrlTarget = (file, specifier) =>
  path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const invariant = (ok, reason) => {
  if (!ok) throw new Error('message proof registry invariant: ' + reason);
};
const runFiles = MESSAGE_RUNS.map(run => run.file);
invariant(MESSAGE_CASES.length === MESSAGE_PROOF_CONTRACT.requiredTests, 'case count');
invariant(
  new Set(MESSAGE_CASES.map(entry => JSON.stringify([entry.file, entry.fullName]))).size ===
    MESSAGE_CASES.length,
  'duplicate case'
);
invariant(
  new Set(runFiles).size === runFiles.length &&
    same([...new Set(MESSAGE_CASES.map(entry => entry.file))].sort(), [...runFiles].sort()),
  'run membership'
);
invariant(
  MESSAGE_RUNS.every(
    run => run.file.startsWith(run.cwd + '/') && MESSAGE_PRIVATE_FILES.includes(run.file)
  ),
  'run location'
);
invariant(
  same(
    MESSAGE_MODULE_URLS[MESSAGE_REPLY_RUNTIME].map(url =>
      messageUrlTarget(MESSAGE_REPLY_RUNTIME, url)
    ),
    [MESSAGE_TSX_LOADER, MESSAGE_REPLY_WORKER]
  ),
  'reply fixture module URLs'
);

// Binds the protected policy to this registry. Agreement is consistency, not authentication:
// the policy JSON and this file are each pinned by the protected producer policy.
export function assertMessageContract(contract, fail) {
  if (
    contract?.id !== MESSAGE_PROOF_CONTRACT.id ||
    contract.version !== MESSAGE_PROOF_CONTRACT.version ||
    contract.compatibility !== MESSAGE_PROOF_CONTRACT.compatibility ||
    !same(contract.operations, MESSAGE_PRIVATE_FILES) ||
    contract.requiredTests !== MESSAGE_PROOF_CONTRACT.requiredTests ||
    contract.runtimeRequired !== true ||
    contract.acceptedReceiptInputs !== false ||
    !same(contract.cases, MESSAGE_CASES)
  )
    fail('contract identity');
  if (!contract.files || Object.hasOwn(contract.files, MESSAGE_WEB_CONFIG))
    fail('configuration admitted as executable model node');
  for (const { file, fileSha256 } of MESSAGE_CASES)
    if (contract.files[file]?.sha256 !== fileSha256) fail('case source pin ' + file);
  for (const run of MESSAGE_RUNS)
    if (contract.configuration?.[run.configFile]?.sha256 !== run.configSha256)
      fail('run configuration pin ' + run.configFile);
}
