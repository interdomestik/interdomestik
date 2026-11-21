// Bind Drizzle builders to the reviewed artifact and their external resolver origins.

import path from 'node:path/posix';
import { hasParallelTarget } from './modules.mjs';
import { isResolverConfig, pathRuleMatch } from './resolution.mjs';
import { SCHEMA_DIR } from './schema-builder-imports.mjs';
import { APP_ALIASES } from './sources.mjs';

const BARREL = `${SCHEMA_DIR}index.ts`;
// The reviewed 0.45.2 artifact has these sole import/default and require targets. The
// parser is deliberately limited to the pinned lockfile layout and the database importer.
const REVIEWED_BUILDERS = new Map([
  ['drizzle-orm', ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']],
  [
    'drizzle-orm/pg-core',
    ['pg-core/index.js', 'pg-core/index.cjs', 'pg-core/index.d.ts', 'pg-core/index.d.cts'],
  ],
]);
const ARTIFACTS = [
  [
    'drizzle-orm',
    '0.45.2',
    'kY0BSaTNYWnoDMVoyY8uxmyHjpJW1geOmBMdSSicKo9CIIWkSxMIj2rkeSR51b8KAPB7m+qysjuHme5nKP+E5Q==',
  ],
  [
    'drizzle-kit',
    '0.31.10',
    '7OZcmQUrdGI+DUNNsKBn1aW8qSoKuTH7d0mYgSP8bAzdFzKoovxEFnoGQp2dVs82EOJeYycqRtciopszwUf8bw==',
  ],
];

export function provenanceProblem(anchor, before, after) {
  for (const specifier of REVIEWED_BUILDERS.keys()) {
    for (const tree of [before, after]) {
      if (
        tree.resolution.pathRules.some(
          ({ pattern }) => pathRuleMatch(pattern, specifier) !== null
        ) ||
        APP_ALIASES.some(([prefix]) => specifier.startsWith(prefix))
      )
        return `builder alias matches ${specifier}`;
      if (
        tree.inventory.resolveSpecifier(BARREL, specifier).external !== specifier ||
        tree.resolution.baseRoots.some(root => {
          const stem = path.join(root, specifier);
          return tree.files.has(`${stem}.ts`) || hasParallelTarget(tree.files, stem);
        })
      )
        return `workspace builder candidate ${specifier}`;
    }
  }
  return builderArtifactProblem(anchor, before, after);
}

function changedInput(anchor, before, after) {
  for (const file of new Set([...before.inputs.keys(), ...after.inputs.keys()])) {
    if (before.inputs.get(file) !== after.inputs.get(file)) return `resolver input changed ${file}`;
  }
  for (const file of new Set([...anchor.inputs.keys(), ...after.inputs.keys()])) {
    if (
      !isResolverConfig(file) &&
      !file.endsWith('package.json') &&
      file !== 'pnpm-lock.yaml' &&
      anchor.inputs.get(file) !== after.inputs.get(file)
    )
      return `unreviewed loader input ${file}`;
  }
  return null;
}

const DB_IMPORTER = '  packages/database:\n';
const DRIZZLE_IMPORTS = /^ {6}drizzle-(?:orm|kit):\n {8}specifier: [^\n]+\n {8}version: [^\n]+$/gmu;

function reviewedLockBlocks(text) {
  const settings = text
    .split(/(?=^\S)/mu)
    .filter(block => /^(?:settings|overrides|patchedDependencies):/u.test(block));
  const artifacts = text
    .split(/(?=^\S|^ {2}\S)/mu)
    .filter(block => /^ {2}drizzle-(?:orm|kit)@/u.test(block) || block.startsWith(DB_IMPORTER));
  return [
    ...settings,
    ...artifacts.map(block =>
      block.startsWith(DB_IMPORTER) ? block.match(DRIZZLE_IMPORTS)?.join('\n') : block.trimEnd()
    ),
  ];
}

function hasReviewedArtifact(blocks, manifest, name, version, integrity) {
  const signature = `integrity: sha512-${integrity},`;
  const matches = blocks.filter(
    block => block?.startsWith(`  ${name}@${version}:`) && block.includes(signature)
  );
  const range = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
  const importer = `      ${name}:\n        specifier: ^${version}\n        version: ${version}`;
  return (
    matches.length === 1 &&
    range === `^${version}` &&
    blocks.some(block => block?.includes(importer))
  );
}

function builderArtifactProblem(anchor, before, after) {
  const change = changedInput(anchor, before, after);
  if (change) return change;
  const current = reviewedLockBlocks(after.inputs.get('pnpm-lock.yaml') ?? '');
  const previous = reviewedLockBlocks(anchor.inputs.get('pnpm-lock.yaml') ?? '');
  if (!current.length || JSON.stringify(current) !== JSON.stringify(previous))
    return 'unreviewed Drizzle lock resolution';
  const manifest = JSON.parse(after.inputs.get('packages/database/package.json') ?? '{}');
  for (const [name, version, integrity] of ARTIFACTS) {
    if (!hasReviewedArtifact(current, manifest, name, version, integrity))
      return `unproven artifact ${name}`;
  }
  return null;
}
