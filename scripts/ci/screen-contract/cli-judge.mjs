import { ScanError } from '../server-mutation/ast.mjs';
import { evaluateCheck, evaluateRetired, selectChecks, selectRetired } from './evaluate.mjs';
import { EXPECTS } from './lint.mjs';
import {
  frozenEntries,
  readLanes,
  registryFor,
  registryTamper,
  testEvidence,
} from './registry.mjs';
import { roleOf } from './roles.mjs';
import { pairTransfers, rebuiltDeclarationErrors, rebuiltRemovals } from './transfer.mjs';

// The registered uses that name a file CHK-22 does not visit in this tree (orphans). The files CHK-22
// visits, not every linted file: a use naming a support file the rule never reads is an orphan
// (r1 H3).
export function orphanUses(files, registry) {
  const present = new Set(files.filter(file => EXPECTS['CHK-22'](roleOf(file), file)));
  const findings = [];
  for (const entry of registry.values())
    for (const use of entry.uses)
      if (!present.has(use.file))
        findings.push({
          id: `CHK-22|${use.file}|orphan-use|${entry.id}:${use.useId}`,
          file: use.file,
          line: 0,
          message: 'the registered use names a file that is not a screen here',
        });
  return { present, findings };
}

// CHK-22's findings and tamper from outside the lint: uses in files that do not exist, the
// registry against the trusted base; and its test evidence, whose failures are input errors.
function chk22Extra(root, files, inputs, base, head) {
  const registry = registryFor(root);
  const errors = testEvidence(root, registry, readLanes(root));
  if (errors.length) throw new ScanError(errors.join('; '));
  const { present, findings } = orphanUses(files, registry);
  const isRendered = entry => present.has(entry.file);
  const tamper = registryTamper(inputs.baseRegistry, registry, base, head, isRendered);
  const enforced = baseline => baseline?.checks?.['CHK-22']?.mode === 'fail';
  if (enforced(base) || enforced(head)) tamper.push(...frozenEntries(registry));
  return { findings, tamper };
}

export function judge(args, repo, root, report, { base, head, authority, inputs, lint, files }) {
  const declared = rebuiltDeclarationErrors(inputs.baseRebuilt, inputs.rebuilt, files, roleOf);
  if (declared.length) throw new ScanError(declared.join('; '));
  const { head: pairedHead, unpaired } = pairTransfers(base, head);
  const shas = { base: report.base, head: report.head };
  const removals = rebuiltRemovals(
    inputs.baseRebuilt,
    inputs.rebuilt,
    authority.base,
    authority.head
  );
  // A check the trusted base names and this scanner retired is judged as a removal (r1 B10).
  const retired = selectRetired(args, base).map(id => evaluateRetired(id, base, head, shas));
  const current = selectChecks(args, base, head).map(check => {
    const extra = check.id === 'CHK-22' ? chk22Extra(root, files, inputs, base, head) : {};
    extra.tamper = [
      ...(extra.tamper ?? []),
      ...unpaired.filter(item => item.startsWith(`${check.id}#`)),
      ...removals,
    ];
    return evaluateCheck(check, lint[check.id], {
      base,
      head,
      pairedHead,
      shas,
      rebuilt: inputs.rebuilt,
      extra,
    });
  });
  return [...current, ...retired];
}
