// The registry entries an element renders through a component, for the consent-control-registered
// rule (CHK-22, §2.1 "Renders").
import { ScanError } from '../../../../scripts/ci/server-mutation/ast.mjs';
import { originIn, originOf } from '../../../../scripts/ci/screen-contract/origins.mjs';
import { kindOfSpecifier } from '../../../../scripts/ci/screen-contract/specifiers.mjs';
import { resolverOf } from './common.mjs';
import { contains, jsxName } from './consent-control-registered-jsx.mjs';
import { importOf, localDeclarationOf } from './consent-control-registered-scope.mjs';

// The origin a JSX element's name refers to, `{ file, name, local }` as origins.mjs gives it:
// an import followed through re-exports, or an exported top-level declaration of this file
// (`sameFile`); null otherwise.
function originOfElement(context, rel, fileExports, element) {
  const nameNode = element.openingElement.name;
  if (nameNode.type === 'JSXMemberExpression') return originOfMember(context, rel, nameNode);
  if (nameNode.type !== 'JSXIdentifier' || !/^[A-Z]/u.test(nameNode.name)) return null;
  const binding = importOf(context, nameNode);
  if (binding) {
    if (kindOfSpecifier(binding.specifier) === 'external') return null;
    return originOf(resolverOf(context), rel, binding.specifier, binding.imported);
  }
  const declaration = localDeclarationOf(context, nameNode);
  if (!declaration || ![...fileExports.values()].includes(declaration)) return null;
  return { file: rel, name: nameNode.name, local: nameNode.name, sameFile: true };
}

// `<Ns.Component />` with `Ns` a namespace import of this tree: the export it names (r3 F6). A
// deeper member of such a namespace (`<Ns.A.B />`), or a name it does not export, could be a
// registered component and is a scanner error (fail closed). A member of a named or default
// import (`<Ctx.Provider />`), a local, a prop or an external module is a property of a value,
// which origins do not follow: the limit of an identifier bound to a prop.
function originOfMember(context, rel, member) {
  let rootNode = member;
  while (rootNode.type === 'JSXMemberExpression') rootNode = rootNode.object;
  const binding = rootNode.type === 'JSXIdentifier' ? importOf(context, rootNode) : null;
  if (binding?.imported !== '*' || kindOfSpecifier(binding.specifier) === 'external') return null;
  const direct = member.object === rootNode;
  const origin = direct
    ? originOf(resolverOf(context), rel, binding.specifier, member.property.name)
    : null;
  if (!origin || origin.external || origin.unresolved)
    throw new ScanError(`${rel}: <${jsxName(member)}> cannot be resolved to a component`);
  return origin;
}

// The declaration a registry target `{ file, exportName }` names, as an origin, or null.
function targetOrigin(context, targetOrigins, target) {
  const key = `${target.file}#${target.exportName}`;
  if (!targetOrigins.has(key)) {
    const found = originIn(resolverOf(context), target.file, target.exportName);
    targetOrigins.set(key, found && !found.unresolved && !found.external ? found : null);
  }
  return targetOrigins.get(key);
}

const ownedBy = (fileExports, element, exportName) => {
  const declaration = fileExports.get(exportName);
  return Boolean(declaration) && contains(declaration, element);
};

// One representation at both ends (code-r2 B7): the registry's public export and the render's
// origin are compared as the declaring file and the declaration they export.
function rendersEntry(context, targetOrigins, entry, origin) {
  const targets = [{ file: entry.file, exportName: entry.exportName }, ...entry.aliases];
  return targets.some(t => {
    const declared = targetOrigin(context, targetOrigins, t);
    return declared?.file === origin.file && declared.local === origin.local;
  });
}

// A render needs no boundary inside the registered alias component that holds it (code-r1 B6),
// or anywhere for a `selfSubmitting` entry outside its own control.
function exemptRender(rel, fileExports, entry, origin, element) {
  if (entry.aliases.some(a => a.file === rel && ownedBy(fileExports, element, a.exportName)))
    return true;
  return Boolean(entry.selfSubmitting) && (origin.sameFile || rel !== entry.file);
}

// The entries an element renders through a component (§2.1 "Renders").
function renderedEntries(context, rel, fileExports, targetOrigins, element, registry) {
  // With no registered render target, no component can render an entry: the origin is not looked
  // up, so an unrelated JSX member cannot fail the scan (the WP-05 flip, r3-B4).
  const targets = [...registry.values()].filter(e => e.exportName && e.kind !== 'not-consent');
  if (!targets.length) return [];
  const origin = originOfElement(context, rel, fileExports, element);
  if (!origin || origin.unresolved || origin.external) return [];
  const out = [];
  for (const entry of targets) {
    if (
      rendersEntry(context, targetOrigins, entry, origin) &&
      !exemptRender(rel, fileExports, entry, origin, element)
    )
      out.push(entry);
  }
  return out;
}

export { ownedBy, renderedEntries };
