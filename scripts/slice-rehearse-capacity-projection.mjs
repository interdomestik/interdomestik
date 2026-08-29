import { allocationDelta, categoryAllocationDelta } from './repo-size-capacity-schema.mjs';
import { budgetCategory } from './repo-size-budget-sync-core.mjs';

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

export function analyzeProjectionReuse({
  budget,
  manifest,
  writerDeltas,
  capacityOwnerDeltas,
  owners,
}) {
  const authorityStops = [];
  const ownerAllocations = {};
  const usageByOwner = new Map();
  const plans = new Map(manifest.pathPlans.map(plan => [plan.path, plan]));
  const projectionPaths = new Set(manifest.topology.projectionPaths);
  const plannedHeadroom = { bytes: 0, files: 0, categories: {} };
  for (const filePath of manifest.topology.projectionPaths) {
    const owner = owners.get(filePath);
    if (!owner) {
      authorityStops.push({ code: 'capacity:projection-writer-unowned', path: filePath });
      continue;
    }
    ownerAllocations[filePath] = owner;
    const allocation = budget.allocations.find(item => item.id === owner);
    const limit = pathLimit(allocation, filePath);
    const plan = plans.get(filePath);
    const facts = writerDeltas[filePath];
    const ownerFacts = capacityOwnerDeltas[filePath];
    if (!facts) {
      authorityStops.push({ code: 'capacity:projection-writer-facts-missing', path: filePath });
      continue;
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
    if (plan.maxBytesDelta > limit) {
      authorityStops.push({
        code: 'capacity:projection-path-insufficient',
        path: filePath,
        owner,
        actual: plan.maxBytesDelta,
        limit,
      });
    }
    if (facts.bytes > limit) {
      authorityStops.push({
        code: 'capacity:projection-current-path-insufficient',
        path: filePath,
        owner,
        actual: facts.bytes,
        limit,
      });
    }
    const usage = usageByOwner.get(owner) ?? { bytes: 0, files: 0, categories: {} };
    usage.bytes += plan.maxBytesDelta;
    usage.files += Number(plan.change === 'create');
    usage.categories[plan.category] = (usage.categories[plan.category] ?? 0) + plan.maxBytesDelta;
    usageByOwner.set(owner, usage);
    const remaining = Math.max(0, plan.maxBytesDelta - facts.bytes);
    plannedHeadroom.bytes += remaining;
    plannedHeadroom.files += Number(plan.change === 'create' && facts.files === 0);
    plannedHeadroom.categories[plan.category] =
      (plannedHeadroom.categories[plan.category] ?? 0) + remaining;
  }
  for (const [owner, usage] of usageByOwner) {
    const allocation = budget.allocations.find(item => item.id === owner);
    for (const filePath of allocation.writerPaths.filter(path => !projectionPaths.has(path))) {
      const facts = capacityOwnerDeltas[filePath];
      if (!facts) continue;
      usage.bytes += facts.bytes;
      usage.files += facts.files;
      const category = budgetCategory(filePath);
      usage.categories[category] = (usage.categories[category] ?? 0) + facts.bytes;
    }
    const byteLimit = allocationDelta(allocation, 'trackedBytesDelta');
    const fileLimit = allocationDelta(allocation, 'trackedFilesDelta');
    if (usage.bytes > byteLimit) {
      authorityStops.push({
        code: 'capacity:projection-owner-tracked-bytes-insufficient',
        owner,
        actual: usage.bytes,
        limit: byteLimit,
      });
    }
    if (usage.files > fileLimit) {
      authorityStops.push({
        code: 'capacity:projection-owner-tracked-files-insufficient',
        owner,
        actual: usage.files,
        limit: fileLimit,
      });
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
  const expectedOwnerPaths = [
    ...new Set(
      [...usageByOwner.keys()].flatMap(
        owner => budget.allocations.find(item => item.id === owner).writerPaths
      )
    ),
  ].sort();
  const actualOwnerPaths = Object.keys(capacityOwnerDeltas).sort();
  const missingPaths = expectedOwnerPaths.filter(path => !actualOwnerPaths.includes(path));
  const unexpectedPaths = actualOwnerPaths.filter(path => !expectedOwnerPaths.includes(path));
  if (missingPaths.length || unexpectedPaths.length) {
    authorityStops.push({
      code: 'capacity:projection-owner-facts-incomplete',
      missingPaths,
      unexpectedPaths,
    });
  }
  return { authorityStops, ownerAllocations, plannedHeadroom };
}
