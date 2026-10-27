import fs from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
export const readCI = name => fs.readFileSync(new URL('./' + name, import.meta.url), 'utf8');
// Explicit unit-only lexical map seeding. This instrumented copy is never a producer file.
function lexical(name, expose, dependencies = {}) {
  let text = fs.readFileSync(new URL('./p2/' + name, import.meta.url), 'utf8');
  const unit = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const node of [...unit.statements].reverse())
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      text = text.slice(0, node.pos) + text.slice(node.end);
  text = text
    .replace(/^export /gm, '')
    .replaceAll('import.meta.url', "'file:///unit-double/bootstrap.mjs'");
  return new Function(...Object.keys(dependencies), text + '\nreturn ' + expose)(
    ...Object.values(dependencies)
  );
}

export const bootstrapFixture = () =>
  lexical(
    'bootstrap.mjs',
    `({takeP2BootstrapInvocation,takeM4C0BootstrapInvocation,consumeM4C0ArtifactAuthority,takeBootstrappedP2CoverageForJoin,takeBootstrappedM4C0CoverageForJoin,seedInvocation:(o,p)=>invocations.set(o,{purpose:p,assertCurrent(){}}),seedResult:(r,p,c)=>results.set(r,{purpose:p,context:JSON.stringify(c),assertCurrent(){},join:()=>({purpose:p})})})`
  );

export function dispatchFixture(context) {
  return lexical(
    'ordinary-dispatch.mjs',
    `({takeFreshP2CoverageForJoin,takeFreshM4C0CoverageForJoin,seed:(r,p)=>freshCoverageResults.set(r,{purpose:p,context:JSON.stringify(${JSON.stringify(context)}),consumed:false,evidence:{nativeAdmission:false}})})`
  );
}
export const artifactFixture = dependencies =>
  lexical('ordinary-artifact.mjs', '({fetchM4C0OrdinaryCoverageArtifact})', dependencies);
