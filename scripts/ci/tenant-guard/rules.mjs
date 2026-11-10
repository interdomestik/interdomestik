// The tenant guard rules (A5 S″ with the A5-r1 corrections) run as ordered stages over one shared
// context: the install stages declare the analyses, then the scan, propagation and report stages
// execute them in the original evaluation order.

import { C1_ADMISSIONS } from './c1-admissions.mjs';
import { LIFETIME_RUNNERS } from './lifetime-runners.mjs';
import { CONTRACTS, LEGACY_PINS, STATE_CONTRACTS } from './manifest.mjs';
import { installAdmission } from './rules-admission.mjs';
import { installCustody } from './rules-custody.mjs';
import { installDependencies } from './rules-dependencies.mjs';
import { installLifetime } from './rules-lifetime.mjs';
import { installReceivers } from './rules-receivers.mjs';
import { installSinks } from './rules-sinks.mjs';
import { installState } from './rules-state.mjs';
import { installStateUse } from './rules-state-use.mjs';
import { installTargets } from './rules-targets.mjs';
import { installTrust } from './rules-trust.mjs';
import { propagate } from './rules-propagate.mjs';
import { report } from './rules-report.mjs';
import { scanSeedTlsEntries } from './rules-seed-tls.mjs';
import { scanFiles } from './rules-scan.mjs';
import { unitName, unitOf } from './syntax.mjs';

export { sha256 } from './rules-digest.mjs';

/**
 * Evaluates the tenant guard over the current sources against the trusted tree.
 * Returns { violations, accepted, telemetry }.
 */
export function evaluate({
  sources,
  trusted,
  graph,
  seedTls = null,
  contracts = CONTRACTS,
  legacyPins = LEGACY_PINS,
  stateContracts = STATE_CONTRACTS,
  admissions = C1_ADMISSIONS,
  lifetimeRunners = LIFETIME_RUNNERS,
}) {
  const violations = [];
  const accepted = [];
  const telemetry = { legacyAccepted: 0, legacySinks: 0, files: 0, contractsUsed: 0 };
  const violate = (file, node, sourceFile, rule, detail) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      rule,
      file,
      line: line + 1,
      unit: unitName(unitOf(node) ?? node, sourceFile),
      detail,
    });
  };
  const ctx = {
    accepted,
    contracts,
    graph,
    seedTls,
    legacyPins,
    lifetimeRunners,
    sources,
    stateContracts,
    telemetry,
    trusted,
    violate,
    violations,
  };
  installTrust(ctx);
  installAdmission(ctx, admissions);
  installDependencies(ctx);
  installState(ctx);
  installStateUse(ctx);
  installTargets(ctx);
  installReceivers(ctx);
  installSinks(ctx);
  installCustody(ctx);
  installLifetime(ctx);
  scanFiles(ctx);
  scanSeedTlsEntries(ctx);
  propagate(ctx);
  ctx.checkLifetime();
  return report(ctx);
}
