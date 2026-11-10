// Exact main loader sites and their existing consumers. Full unit syntax prevents additions
// under an old unit name. Existing LEGACY_PINS and contracts.mjs remain untouched.
import ts from 'typescript';
import { collectUnits, fingerprint, parseSource, unitName, unitOf } from './syntax.mjs';

export const VERIFIER = 'packages/database/src/migration-callback-source-verifier.ts';
const sources = new Map([
  [
    'CALLBACK_SOURCE_OPS',
    `export const CALLBACK_SOURCE_OPS: Readonly<CallbackSourceOps> = Object.freeze({
  noFollowFlag: typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0,
  resolve: resolveCallbackSource,
  realpath,
  lstat: async (path: string) => convert(await lstat(path, { bigint: true })),
  open: async (path: string) => {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    return {
      stat: async () => convert((await handle.stat({ bigint: true })) as never),
      read: async (target, offset, length, position) =>
        (await handle.read(target, offset, length, position)).bytesRead,
      close: () => handle.close(),
    } satisfies CallbackSourceHandle;
  },
  importModule: (url: string) => import(url),
});`,
  ],
  ['requireFromHere', `const requireFromHere = createRequire(import.meta.url);`],
  ['importModule', `(url: string) => import(url)`],
  [
    'resolveCallbackSource',
    `export function resolveCallbackSource(
  specifier: string,
  nativeResolve: ((value: string) => string) | undefined = typeof import.meta.resolve === 'function'
    ? import.meta.resolve.bind(import.meta)
    : undefined,
  requireResolve: (value: string) => string = requireFromHere.resolve.bind(requireFromHere)
): string {
  if (!CALLBACK_SOURCE_MANIFEST.some(item => item.specifier === specifier)) rejected();
  if (nativeResolve) return nativeResolve(specifier);
  const resolved = requireResolve(specifier);
  return pathToFileURL(resolved.endsWith('.cjs') ? \`\${resolved.slice(0, -4)}.js\` : resolved).href;
}`,
  ],
  [
    'verifyMigrationCallbackSources',
    `export async function verifyMigrationCallbackSources(
  ops: Readonly<CallbackSourceOps> = CALLBACK_SOURCE_OPS,
  loadReader = true
): Promise<CallbackSourceBinding> {
  try {
    if (!Number.isFinite(ops.noFollowFlag) || ops.noFollowFlag === 0) rejected();
    const hashes: string[] = [],
      urls: string[] = [];
    let packageRoot: string | undefined;
    for (const expected of CALLBACK_SOURCE_MANIFEST) {
      const source = await bindExpectedSource(expected, ops);
      if (packageRoot !== undefined && source.root !== packageRoot) rejected();
      packageRoot = source.root;
      hashes.push(source.hash);
      urls.push(source.url);
    }
    let reader = null;
    if (loadReader) {
      const namespace = await ops.importModule(urls[0]);
      // prettier-ignore
      if (!namespace || typeof namespace !== 'object' || Object.getOwnPropertyNames(namespace).length !== 1 || !Object.hasOwn(namespace, 'readMigrationFiles') || typeof (namespace as { readMigrationFiles?: unknown }).readMigrationFiles !== 'function') rejected();
      reader = (namespace as { readMigrationFiles: CallbackSourceBinding['reader'] })
        .readMigrationFiles;
    }
    // prettier-ignore
    return Object.freeze({ packageRoot: packageRoot!, hashes: Object.freeze(hashes), urls: Object.freeze(urls), reader });
  } catch (error) {
    if (error instanceof CallbackPlanFault) throw error;
    throw new CallbackPlanFault('MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED');
  }
}`,
  ],
]);
const prints = new Map(
  [...sources].map(([name, text]) => {
    const source = parseSource(
      VERIFIER,
      name === 'importModule' ? `const importModule = ${text};` : text
    );
    const unit = collectUnits(source).find(unit =>
      name === 'importModule' ? ts.isArrowFunction(unit) : unitName(unit, source) === name
    );
    return [name, fingerprint(unit, source)];
  })
);
const unitsBySource = new WeakMap();
export function isVerifierUnit(scan, node, name) {
  if (scan.file !== VERIFIER || unitName(unitOf(node), scan.sourceFile) !== name) return false;
  if (!unitsBySource.has(scan.sourceFile))
    unitsBySource.set(scan.sourceFile, collectUnits(scan.sourceFile));
  const matches = unitsBySource
    .get(scan.sourceFile)
    .filter(unit => unitName(unit, scan.sourceFile) === name);
  return matches.length === 1 && prints.get(name) === fingerprint(unitOf(node), scan.sourceFile);
}
export function existingVerifierSite(scan, node) {
  if (isVerifierUnit(scan, node, 'requireFromHere')) return true;
  if (!isVerifierUnit(scan, node, 'importModule')) return false;
  const property = unitOf(node).parent;
  const object = property.parent;
  const freeze = object.parent;
  const declaration = freeze.parent;
  return (
    ts.isPropertyAssignment(property) &&
    ts.isObjectLiteralExpression(object) &&
    ts.isCallExpression(freeze) &&
    freeze.arguments.length === 1 &&
    freeze.expression.getText(scan.sourceFile) === 'Object.freeze' &&
    !scan.fact.references.find(reference => reference.node === freeze.expression.expression)
      ?.binding &&
    ts.isVariableDeclaration(declaration) &&
    declaration.name.getText(scan.sourceFile) === 'CALLBACK_SOURCE_OPS' &&
    isVerifierUnit(scan, declaration, 'CALLBACK_SOURCE_OPS')
  );
}
