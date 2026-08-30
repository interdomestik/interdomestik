import { allocationDelta, categoryAllocationDelta } from './repo-size-capacity-schema.mjs';
import { budgetCategory } from './repo-size-budget-sync-core.mjs';
import { compareText } from './slice-rehearse-canonical.mjs';

function pathLimit(allocation, filePath) {
  return allocation.mode === 'exact'
    ? allocation.pathBytesDelta[filePath]
    : allocation.maxPathBytesDelta[filePath];
}

function sameProjectionFact(left, right) {
  return [
    'currentBytes',
    'currentSha256',
    'files',
    'capacityBaselineExists',
    'currentExists',
  ].every(key => left?.[key] === right?.[key]);
}

function recordProjectionPath(context, filePath) {
  const { authorityStops, budget, capacityOwnerDeltas, ownerAllocations, owners } = context;
  const owner = owners.get(filePath);
  if (!owner) {
    authorityStops.push({ code: 'capacity:projection-writer-unowned', path: filePath });
    return;
  }
  ownerAllocations[filePath] = owner;
  const allocation = budget.allocations.find(item => item.id === owner);
  const limit = pathLimit(allocation, filePath);
  context.projectionPathCaps[filePath] = limit;
  const plan = context.plans.get(filePath);
  const facts = context.writerDeltas[filePath];
  const ownerFacts = capacityOwnerDeltas[filePath];
  if (!facts) {
    authorityStops.push({ code: 'capacity:projection-writer-facts-missing', path: filePath });
    return;
  }
  if (!sameProjectionFact(facts, ownerFacts)) {
    authorityStops.push({ code: 'capacity:projection-owner-fact-mismatch', path: filePath });
  }
  if (!facts.capacityBaselineExists || facts.files !== 0) {
    authorityStops.push({ code: 'capacity:projection-writer-not-preexisting', path: filePath });
  }
  if (plan.change !== 'modify') {
    authorityStops.push({ code: 'capacity:projection-writer-must-modify', path: filePath });
  }
  for (const [actual, code] of [
    [plan.maxBytesDelta, 'capacity:projection-path-insufficient'],
    [facts.bytes, 'capacity:projection-current-path-insufficient'],
  ]) {
    if (actual > limit) authorityStops.push({ code, path: filePath, owner, actual, limit });
  }
  const usage = context.usageByOwner.get(owner) ?? { bytes: 0, files: 0, categories: {} };
  usage.bytes += plan.maxBytesDelta;
  usage.files += Number(plan.change === 'create');
  usage.categories[plan.category] = (usage.categories[plan.category] ?? 0) + plan.maxBytesDelta;
  context.usageByOwner.set(owner, usage);
  const remaining = Math.max(0, plan.maxBytesDelta - facts.bytes);
  context.plannedHeadroom.paths[filePath] = remaining;
  context.plannedHeadroom.bytes += remaining;
  context.plannedHeadroom.files += Number(plan.change === 'create' && facts.files === 0);
  context.plannedHeadroom.categories[plan.category] =
    (context.plannedHeadroom.categories[plan.category] ?? 0) + remaining;
}

function validateOwnerUsage(context, owner, usage) {
  const { allocation, authorityStops } = context;
  for (const filePath of allocation.writerPaths.filter(
    path => !context.projectionPaths.has(path)
  )) {
    const facts = context.capacityOwnerDeltas[filePath];
    if (!facts) continue;
    usage.bytes += facts.bytes;
    usage.files += facts.files;
    const category = budgetCategory(filePath);
    usage.categories[category] = (usage.categories[category] ?? 0) + facts.bytes;
  }
  for (const [actual, limit, code] of [
    [
      usage.bytes,
      allocationDelta(allocation, 'trackedBytesDelta'),
      'capacity:projection-owner-tracked-bytes-insufficient',
    ],
    [
      usage.files,
      allocationDelta(allocation, 'trackedFilesDelta'),
      'capacity:projection-owner-tracked-files-insufficient',
    ],
  ]) {
    if (actual > limit) authorityStops.push({ code, owner, actual, limit });
  }
  for (const [category, actual] of Object.entries(usage.categories)) {
    const limit = categoryAllocationDelta(allocation, category);
    if (actual > limit) {
      authorityStops.push({
        code: 'capacity:projection-owner-category-insufficient',
        owner,
        category,
        actual,
        limit,
      });
    }
  }
}

export function analyzeProjectionReuse({
  budget,
  manifest,
  writerDeltas,
  capacityOwnerDeltas,
  owners,
}) {
  const authorityStops = [];
  const ownerAllocations = {};
  const projectionPathCaps = {};
  const usageByOwner = new Map();
  const plans = new Map(manifest.pathPlans.map(plan => [plan.path, plan]));
  const projectionPaths = new Set(manifest.topology.projectionPaths);
  const plannedHeadroom = { bytes: 0, files: 0, categories: {}, paths: {} };
  const context = {
    authorityStops,
    budget,
    capacityOwnerDeltas,
    manifest,
    ownerAllocations,
    owners,
    plans,
    plannedHeadroom,
    projectionPathCaps,
    projectionPaths,
    usageByOwner,
    writerDeltas,
  };
  for (const filePath of manifest.topology.projectionPaths) recordProjectionPath(context, filePath);
  for (const [owner, usage] of usageByOwner) {
    const allocation = budget.allocations.find(item => item.id === owner);
    validateOwnerUsage({ ...context, allocation }, owner, usage);
  }
  const expectedOwnerPaths = [
    ...new Set(
      [...usageByOwner.keys()].flatMap(
        owner => budget.allocations.find(item => item.id === owner).writerPaths
      )
    ),
  ].sort(compareText);
  const actualOwnerPaths = Object.keys(capacityOwnerDeltas).sort(compareText);
  const missingPaths = expectedOwnerPaths.filter(path => !actualOwnerPaths.includes(path));
  const unexpectedPaths = actualOwnerPaths.filter(path => !expectedOwnerPaths.includes(path));
  if (missingPaths.length || unexpectedPaths.length) {
    authorityStops.push({
      code: 'capacity:projection-owner-facts-incomplete',
      missingPaths,
      unexpectedPaths,
    });
  }
  return { authorityStops, ownerAllocations, plannedHeadroom, projectionPathCaps };
}
