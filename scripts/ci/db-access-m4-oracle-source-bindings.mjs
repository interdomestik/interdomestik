// Exact erased-type witnesses are native source facts, not executed modules.
import { hash } from './db-access-provider-runtime-identity.mjs';

const typeRoles = Object.freeze({
  'apps/web/src/server/operations/m4-private-runtime-types.ts': 'runtimeTypes',
  'apps/web/src/server/operations/m4-assignment-controller-types.ts': 'controllerTypes',
});
const fail = reason => {
  throw Error('M4 oracle source binding refused: ' + reason);
};

// Called only after the existing live native/source and runtime/image ownership
// checks. These projected records cannot construct or replace either handle.
export function bindM4OracleSource(source, imageRecords, file) {
  const sha256 = source.sourceRecords[file]?.sha256;
  if (!sha256) fail('missing native source record');
  const role = Object.hasOwn(typeRoles, file) ? typeRoles[file] : undefined;
  if (role) {
    const derived = source.derivations.privateRuntime;
    const fact = derived?.facts?.types?.[role];
    if (
      derived?.sourceSha256?.[file] !== sha256 ||
      !fact ||
      !Object.hasOwn(fact, 'tree') ||
      !Array.isArray(fact.runtimeEffects) ||
      fact.runtimeEffects.length !== 0
    )
      fail('missing or changed exact native erased-type derivation');
    if (imageRecords[file] && imageRecords[file].sha256 !== sha256)
      fail('copied type witness differs from native source');
    return {
      file,
      sha256,
      binding: 'native-erased-type-witness',
      typeFactPath: '/derivations/privateRuntime/facts/types/' + role,
      typeFactSha256: hash(JSON.stringify(fact)),
      executedImageBinding: false,
    };
  }
  if (imageRecords[file]?.sha256 !== sha256)
    fail('fact source differs between native and executed image');
  return { file, sha256, binding: 'native-and-runtime-image', executedImageBinding: true };
}
