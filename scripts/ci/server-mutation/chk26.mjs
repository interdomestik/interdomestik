// CHK-26 (design §6.2): the public-entry registry, both directions, for server actions, machine
// routes, pages outside the four portals and identity mechanisms. Every entry is an open closure
// item `entryId@binding#no-closure` in part 1 (closedBy is null by schema).
import fs from 'node:fs';
import path from 'node:path';

import { listSourceFiles } from './ast.mjs';
import { publicDefinitions } from './chk04.mjs';
import { authBinding, detectAuthMechanisms } from './chk26-auth.mjs';
import { routeProblem } from './chk26-routes.mjs';
import { deniedTestProblem } from './chk26-tests.mjs';
import { collectUnits } from './units.mjs';

// The four portal path segments of R-34 (route segments, not roles).
const PORTAL_SEGMENT = /^(?:member|agent|staff|admin)$/u;
const isPortalPage = page => page.split('/').some(segment => PORTAL_SEGMENT.test(segment));

function bindingOf(entry) {
  if (entry.kind === 'server-action') return `${entry.module}#${entry.export}`;
  if (entry.kind === 'route') return `${entry.module}#${entry.method}`;
  if (entry.kind === 'page') return entry.page;
  return authBinding(entry);
}

function pagesOutsidePortals(root) {
  return listSourceFiles(root, ['apps/web/src/app']).filter(
    file => file.endsWith('/page.tsx') && !isPortalPage(file.slice('apps/web/src/app/'.length))
  );
}

function routeFindings(ctx, entry, units) {
  const unit = units.routes.find(
    candidate => candidate.file === entry.module && candidate.method === entry.method
  );
  if (!unit?.target) return ['route method does not exist'];
  const { problem, effect } = routeProblem({
    root: ctx.root,
    entry,
    target: unit.target,
    parse: ctx.parse,
  });
  const testProblem = deniedTestProblem({ root: ctx.root, entry, parse: ctx.parse, effect });
  return [problem, testProblem].filter(Boolean);
}

function claimFindings(registry, add) {
  const bindings = new Map();
  for (const entry of registry.entries) {
    const binding = bindingOf(entry);
    add(
      `${entry.id}@${binding}#no-closure`,
      'open public entry (closure designed with WP-10)',
      entry.module ?? entry.page
    );
    if (bindings.has(binding))
      add(`${entry.id}@${binding}#second-claimant`, `also claimed by ${bindings.get(binding)}`);
    else bindings.set(binding, entry.id);
  }
}

function actionFindings(root, registry, units, add) {
  const actions = registry.entries.filter(e => e.kind === 'server-action');
  const exports = new Set(units.actions.map(unit => `${unit.file}#${unit.name}`));
  for (const entry of actions)
    for (const binding of [bindingOf(entry), ...(entry.aliases ?? [])])
      if (!exports.has(binding))
        add(`${entry.id}@${binding}#missing-binding`, 'no such server action export');
  for (const def of publicDefinitions(root, units.actions)) {
    const claimants = actions.filter(e => e.operation === def.name);
    if (claimants.length !== 1)
      add(
        `${def.unit.id}#public-unbound`,
        `${claimants.length} registry entries claim ${def.name}`,
        def.unit.file
      );
  }
}

function pageFindings(root, registry, add) {
  const pages = pagesOutsidePortals(root);
  const listed = new Set(registry.entries.filter(e => e.kind === 'page').map(e => e.page));
  for (const page of pages.filter(p => !listed.has(p)))
    add(`page-unlisted@${page}`, 'page outside the portals is not registered', page);
  for (const page of listed)
    if (!fs.existsSync(path.join(root, page)) || isPortalPage(page))
      add(`page-missing@${page}`, 'registered page does not exist outside the portals');
  return pages;
}

function authFindings(ctx, registry, add) {
  const mechanisms = detectAuthMechanisms(ctx);
  const registered = new Set(
    registry.entries.filter(e => e.kind === 'auth-mechanism').map(authBinding)
  );
  for (const found of mechanisms)
    if (found.unclassified || !registered.has(found.binding))
      add(`auth-unlisted@${found.binding}`, 'identity mechanism is not registered', found.file);
  const detected = new Set(mechanisms.map(found => found.binding));
  for (const binding of registered)
    if (!detected.has(binding)) add(`auth-missing@${binding}`, 'registered mechanism not found');
  return mechanisms;
}

const countOf = (registry, kind) => registry.entries.filter(e => e.kind === kind).length;

export const CHK26 = {
  id: 'CHK-26',
  sources: [
    'ast.mjs',
    'units.mjs',
    'registry.mjs',
    'chk04.mjs',
    'chk26.mjs',
    'chk26-auth.mjs',
    'chk26-routes.mjs',
    'chk26-tests.mjs',
  ],
  needsRegistry: true,
  run(ctx) {
    const { root, files, parse, registry } = ctx;
    const units = collectUnits({ root, files, parse });
    const findings = [];
    const add = (id, message, file = null) => findings.push({ id, file, message });
    claimFindings(registry, add);
    actionFindings(root, registry, units, add);
    for (const entry of registry.entries.filter(e => e.kind === 'route'))
      for (const problem of routeFindings(ctx, entry, units))
        add(`${entry.id}@${bindingOf(entry)}#route:${problem}`, problem, entry.module);
    const pages = pageFindings(root, registry, add);
    const mechanisms = authFindings({ root, files, parse }, registry, add);
    const counts = {
      'server-action': countOf(registry, 'server-action'),
      route: countOf(registry, 'route'),
      page: pages.length,
      'auth-mechanism': mechanisms.length,
    };
    return { units: counts, findings };
  },
};
