// CHK-22 (R-23e): a consent control is registered, each use of it sits in a marked submission
// boundary, and the boundary invokes the registered submission (WP-05 design §2.1; B3, B11, B16,
// B20, and the post-r5 formAction rule). Names are resolved lexically through ESLint's scope
// analysis, never by spelling across the file (code-r1 B7).
import { registryFor } from '../../../../scripts/ci/screen-contract/registry.mjs';
import { fileOf, report, rule, unitCounter } from './common.mjs';
import { boundaryLabels, exportsOf } from './consent-control-registered-declarations.mjs';
import {
  FORMS,
  LABELS,
  attributeOf,
  elementName,
  enclosingForm,
  isControl,
  literalAttribute,
} from './consent-control-registered-jsx.mjs';
import { vocabularyHit } from './consent-control-registered-labels.mjs';
import { ownedBy, renderedEntries } from './consent-control-registered-renders.mjs';
import { invokedSubmissions } from './consent-control-registered-submission.mjs';

export default rule('A consent control is registered and tested (CHK-22)', context => {
  const { root, rel, role } = fileOf(context);
  const inInventory =
    role === 'screen' || (role === 'support' && rel.startsWith('packages/ui/src/'));
  if (!inInventory) return {};
  const keys = context.sourceCode.visitorKeys;
  const units = unitCounter(context, 'CHK-22');
  const elements = []; // every JSXElement
  let fileExports = new Map(); // export name -> top-level declaration, set at Program:exit
  const targetOrigins = new Map(); // registry target key -> its origin, the cache of targetOrigin
  const flag = (node, kind, key, text) =>
    report(context, node, `CHK-22|${rel}|${kind}|${key}`, text);

  function indexById() {
    const byId = { labelsFor: new Map(), elements: new Map() };
    for (const element of elements) {
      const opening = element.openingElement;
      const id = literalAttribute(opening, 'id');
      if (id) byId.elements.set(id, [...(byId.elements.get(id) ?? []), element]);
      const target = LABELS.has(elementName(opening)) ? literalAttribute(opening, 'htmlFor') : null;
      if (target) byId.labelsFor.set(target, [...(byId.labelsFor.get(target) ?? []), element]);
    }
    return byId;
  }

  // Counts a control and flags it when it reads as consent, or carries a non-literal
  // `data-consent` (code-r1 H2), without a literal `data-consent`; true if flagged.
  function flagUnregistered(element, consentId, byId) {
    const opening = element.openingElement;
    if (!isControl(opening)) return false;
    units.add('control');
    if (consentId) return false;
    const dynamic = Boolean(attributeOf(opening, 'data-consent'));
    if (!dynamic && !vocabularyHit(context, root, rel, keys, element, byId)) return false;
    const key =
      literalAttribute(opening, 'id') ??
      literalAttribute(opening, 'name') ??
      literalAttribute(opening, 'data-testid') ??
      '?';
    flag(
      element,
      'unregistered',
      `${elementName(opening)}:${key}`,
      dynamic
        ? 'consent control with a non-literal data-consent'
        : 'consent control without data-consent'
    );
    return true;
  }

  // The registry entries the element renders: its own `data-consent` use, or the entries of
  // the component it renders. A misbound `data-consent` is flagged and renders none. The control
  // is the definition only inside the component exported as `exportName` (code-r1 B6).
  function elementRenders(element, consentId, registry) {
    if (!consentId)
      return renderedEntries(context, rel, fileExports, targetOrigins, element, registry);
    const opening = element.openingElement;
    const entry = registry.get(consentId);
    const control = literalAttribute(opening, 'id') ?? literalAttribute(opening, 'name');
    if (entry?.file !== rel || entry.control !== control) {
      flag(element, 'misbound', consentId, `data-consent ${consentId} is not this file's control`);
      return [];
    }
    // An exported control is judged at its renders; the registry requires it to have a use or to
    // be selfSubmitting (r5 B2), so a route's component cannot rest on this exemption.
    const isDefinition =
      Boolean(entry.exportName) &&
      !entry.selfSubmitting &&
      ownedBy(fileExports, element, entry.exportName);
    return !isDefinition && entry.kind !== 'not-consent' ? [entry] : [];
  }

  function analyse(program) {
    const registry = registryFor(root);
    fileExports = exportsOf(program);
    const byId = indexById();
    const renders = []; // { element, entry }
    for (const element of elements) {
      const consentId = literalAttribute(element.openingElement, 'data-consent');
      if (flagUnregistered(element, consentId, byId)) continue;
      for (const entry of elementRenders(element, consentId, registry))
        renders.push({ element, entry });
    }
    judgeBoundaries(renders, registry);
    units.flush(program);
  }

  // Each render's boundary, and every element marked `data-consent-use` even when no render was
  // recognized there (code-r1 H2).
  function boundariesOf(renders) {
    const boundaries = new Map(); // node -> { isForm, entries:Set }
    for (const { element, entry } of renders) {
      const form = enclosingForm(element);
      const node = form ?? element;
      if (!boundaries.has(node))
        boundaries.set(node, { isForm: Boolean(form), entries: new Set() });
      boundaries.get(node).entries.add(entry.id);
    }
    for (const element of elements)
      if (!boundaries.has(element) && attributeOf(element.openingElement, 'data-consent-use'))
        boundaries.set(element, {
          isForm: FORMS.has(elementName(element.openingElement)),
          entries: new Set(),
        });
    return boundaries;
  }

  // The boundary's listed uses that are this file's, counting each in `listedTimes`.
  function validUses(node, label, entries, registry, listedTimes) {
    const tokens = (literalAttribute(node.openingElement, 'data-consent-use') ?? '')
      .split(/\s+/u)
      .filter(Boolean);
    const valid = [];
    for (const token of tokens) {
      const [entryId, useId, extra] = token.split(':');
      const use = registry.get(entryId)?.uses.find(u => u.useId === useId);
      if (extra !== undefined || use?.file !== rel) {
        flag(
          node,
          'unmatched-boundary',
          `${token}@${label}`,
          `listed use ${token} is unknown or not this file's`
        );
        continue;
      }
      listedTimes.set(token, (listedTimes.get(token) ?? 0) + 1);
      if (!entries.has(entryId))
        flag(node, 'orphan-use', token, `${token} has no render in this boundary`);
      valid.push({ token, use });
    }
    return valid;
  }

  function judgeSubmission(node, isForm, valid) {
    const invoked = invokedSubmissions(context, root, rel, keys, node, isForm);
    if (!invoked) {
      flag(
        node,
        'unresolved-submission',
        valid.map(v => v.token).join(' '),
        'the submission cannot be resolved here'
      );
      return;
    }
    for (const { token, use } of valid)
      if (invoked.some(submission => submission !== use.submission))
        flag(
          node,
          'submission-mismatch',
          token,
          `invokes ${invoked.join(', ')}, registered ${use.submission}`
        );
  }

  function judgeBoundary(node, label, { isForm, entries }, registry, listedTimes) {
    units.add('boundary');
    const valid = validUses(node, label, entries, registry, listedTimes);
    for (const entryId of entries)
      if (!valid.some(v => v.token.startsWith(`${entryId}:`)))
        flag(
          node,
          'unmatched-boundary',
          `${entryId}@${label}`,
          `the boundary does not list a use of ${entryId}`
        );
    if (valid.length) judgeSubmission(node, isForm, valid);
  }

  function flagListing(listedTimes, registry) {
    for (const [token, times] of listedTimes)
      if (times > 1)
        flag(
          context.sourceCode.ast,
          'shared-use',
          token,
          `${token} is listed by ${times} boundaries`
        );
    for (const entry of registry.values())
      for (const use of entry.uses) {
        const token = `${entry.id}:${use.useId}`;
        if (use.file === rel && !listedTimes.has(token))
          flag(
            context.sourceCode.ast,
            'orphan-use',
            token,
            `${token} is listed by no boundary here`
          );
      }
  }

  function judgeBoundaries(renders, registry) {
    const listedTimes = new Map();
    const boundaries = boundariesOf(renders);
    const labels = boundaryLabels(boundaries.keys());
    for (const [node, boundary] of boundaries)
      judgeBoundary(node, labels.get(node), boundary, registry, listedTimes);
    flagListing(listedTimes, registry);
  }

  return {
    JSXElement(node) {
      elements.push(node);
    },
    'Program:exit': analyse,
  };
});
