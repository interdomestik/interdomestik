export function allocationBudget() {
  return {
    version: 2,
    baseline: {
      protectedMainSha: 'a'.repeat(40),
      trackedBytes: 1000,
      trackedFiles: 10,
      categoryBytes: {
        'config/data/messages': 100,
        'docs/text': 100,
        'large support/generated-ish': 100,
        other: 100,
        'source/scripts': 300,
        'tests/e2e': 300,
      },
    },
    allocations: [
      {
        id: 'capacity-rebase',
        mode: 'exact',
        writerPaths: ['scripts/repo-size-budget.json'],
        trackedBytesDelta: 10,
        trackedFilesDelta: 0,
        categoryBytesDelta: { 'config/data/messages': 10 },
        pathBytesDelta: { 'scripts/repo-size-budget.json': 10 },
      },
      {
        id: 'lean-repair',
        mode: 'bounded',
        writerPaths: ['scripts/lean.mjs', 'scripts/lean.test.mjs'],
        maxTrackedBytesDelta: 30,
        maxTrackedFilesDelta: 0,
        maxCategoryBytesDelta: { 'source/scripts': 20, 'tests/e2e': 10 },
        maxPathBytesDelta: { 'scripts/lean.mjs': 20, 'scripts/lean.test.mjs': 10 },
      },
    ],
    reserve: {
      trackedBytes: 2,
      trackedFiles: 0,
      categoryBytes: { 'docs/text': 2 },
      rationale: 'Observed protected-main tree variance only; not consumable by changed paths.',
    },
    maxTrackedBytes: 1042,
    maxTrackedFiles: 10,
    maxCategoryBytes: {
      'config/data/messages': 110,
      'docs/text': 102,
      'large support/generated-ish': 100,
      other: 100,
      'source/scripts': 320,
      'tests/e2e': 310,
    },
    maxLargestFileBytes: 1000,
    maxSourceOrTestLines: 1000,
  };
}

export function capacityReport({
  bytes = 1040,
  files = 10,
  configBytes = 110,
  sourceBytes = 320,
  testBytes = 310,
} = {}) {
  return {
    tracked: {
      total: { bytes, files },
      categories: [
        { name: 'config/data/messages', bytes: configBytes },
        { name: 'docs/text', bytes: 100 },
        { name: 'large support/generated-ish', bytes: 100 },
        { name: 'other', bytes: 100 },
        { name: 'source/scripts', bytes: sourceBytes },
        { name: 'tests/e2e', bytes: testBytes },
      ],
      largestFiles: [{ path: 'scripts/lean.mjs', bytes: 500 }],
      sourceHotspots: [{ path: 'scripts/lean.mjs', lines: 20 }],
    },
  };
}

export function acceptedChangeFacts() {
  return [
    { path: 'scripts/repo-size-budget.json', bytesDelta: 10, filesDelta: 0 },
    { path: 'scripts/lean.mjs', bytesDelta: 20, filesDelta: 0 },
    { path: 'scripts/lean.test.mjs', bytesDelta: 10, filesDelta: 0 },
  ];
}
