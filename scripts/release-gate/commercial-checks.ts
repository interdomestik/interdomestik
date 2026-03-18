const { TIMEOUTS } = require('./config.ts');
const {
  collectVisibleTestIds,
  seedCookieConsentState,
  visitReleaseGateScenario,
} = require('./scenario-visits.ts');
const { loginWithRunContext } = require('./session-navigation.ts');
const { resolveG10Scenario } = require('./staff-claim-driver.ts');

const MATTER_ALLOWANCE_TEST_ID_SUFFIXES = [
  'matter-allowance',
  'matter-allowance-used',
  'matter-allowance-remaining',
  'matter-allowance-total',
];

const DEFAULT_MATTER_ALLOWANCE_VALUES = {
  used: '0',
  remaining: '2',
  total: '2',
};

const MATTER_AND_SLA_SCENARIO_DEFINITIONS = [
  {
    id: 'member_running',
    account: 'member',
    title: 'Member submitted claim shows running SLA and allowance',
    routePath: '/member/claims/golden_ks_a_claim_05',
    testIdPrefix: 'member-claim',
    slaCopy: 'Response timer is running.',
  },
  {
    id: 'member_incomplete',
    account: 'member',
    title: 'Member verification claim shows waiting SLA and allowance',
    routePath: '/member/claims/golden_ks_a_claim_13',
    testIdPrefix: 'member-claim',
    slaCopy: 'Waiting for your information before the SLA starts.',
  },
  {
    id: 'staff_running',
    account: 'staff',
    title: 'Staff submitted claim shows running SLA and allowance',
    routePath: '/staff/claims/golden_ks_a_claim_05',
    testIdPrefix: 'staff-claim-detail',
    slaCopy: 'Running',
    requiresReadyMarker: true,
  },
  {
    id: 'staff_incomplete',
    account: 'staff',
    title: 'Staff verification claim shows member-waiting SLA and allowance',
    routePath: '/staff/claims/golden_ks_a_claim_13',
    testIdPrefix: 'staff-claim-detail',
    slaCopy: 'Waiting for member information',
    requiresReadyMarker: true,
  },
];

const ESCALATION_AGREEMENT_COLLECTION_FALLBACK_SCENARIO_DEFINITIONS = [
  {
    id: 'staff_unsigned_agreement',
    account: 'staff',
    title: 'Staff accepted case without a signed agreement stays blocked',
    routePath: '/staff/claims/golden_ks_a_claim_14',
    requiredPrerequisitePhrases: ['Agreement Missing', 'Collection path Missing'],
    requiredPhrases: [
      'Accepted recovery prerequisites',
      'Save the accepted escalation agreement before moving this case into negotiation or court.',
    ],
  },
  {
    id: 'staff_signed_deduction',
    account: 'staff',
    title: 'Staff accepted case with a signed deduction path stays ready',
    routePath: '/staff/claims/golden_ks_a_claim_15',
    requiredPrerequisitePhrases: ['Agreement Ready', 'Collection path Ready'],
    requiredPhrases: [
      'Payment authorization',
      'authorized',
      'Terms version',
      '2026-03-v1',
      'Deduct from payout',
    ],
  },
  {
    id: 'staff_payment_method_fallback',
    account: 'staff',
    title: 'Staff accepted case resolves fallback to stored payment method charge',
    routePath: '/staff/claims/golden_ks_a_claim_17',
    requiredPrerequisitePhrases: ['Agreement Ready', 'Collection path Ready'],
    requiredPhrases: ['Charge stored payment method', 'Stored payment method', 'Yes'],
  },
  {
    id: 'staff_invoice_fallback',
    account: 'staff',
    title: 'Staff accepted case resolves fallback to invoice when no stored payment method exists',
    routePath: '/staff/claims/golden_ks_a_claim_16',
    requiredPrerequisitePhrases: ['Agreement Ready', 'Collection path Ready'],
    requiredPhrases: ['Invoice fallback', 'Stored payment method', 'No', 'Invoice due'],
  },
];

function buildCommercialPromiseScenarios(runCtx) {
  const { buildRoute } = require('./shared.ts');
  return [
    {
      id: 'pricing',
      account: null,
      title: 'Pricing public contract',
      url: buildRoute(runCtx.baseUrl, runCtx.locale, '/pricing'),
      requiredTestIds: [
        'pricing-commercial-disclaimers',
        'pricing-success-fee-calculator',
        'pricing-billing-terms',
        'pricing-coverage-matrix',
      ],
    },
    {
      id: 'register',
      account: null,
      title: 'Register checkout-adjacent commercial contract',
      url: buildRoute(runCtx.baseUrl, runCtx.locale, '/register'),
      requiredTestIds: [
        'register-success-fee-calculator',
        'register-billing-terms',
        'register-coverage-matrix',
      ],
    },
    {
      id: 'services',
      account: null,
      title: 'Services promise boundaries',
      url: buildRoute(runCtx.baseUrl, runCtx.locale, '/services'),
      requiredTestIds: ['services-commercial-disclaimers', 'services-coverage-matrix'],
    },
    {
      id: 'membership',
      account: 'member',
      title: 'Member commercial continuity',
      url: buildRoute(runCtx.baseUrl, runCtx.locale, '/member/membership'),
      requiredTestIds: ['membership-commercial-disclaimers', 'membership-coverage-matrix'],
    },
  ];
}

function buildFreeStartGroupPrivacyScenarios(runCtx) {
  const { buildRoute } = require('./shared.ts');
  return [
    {
      id: 'free_start',
      account: null,
      title: 'Free Start informational-only boundary',
      url: buildRoute(runCtx.baseUrl, runCtx.locale, '/'),
      requiredTestIds: ['free-start-triage-note'],
      requiredPhrases: ['Free Start stays informational', 'hotline stays routing-only'],
      forbiddenPhrases: [],
    },
    {
      id: 'group_dashboard',
      account: 'office_agent',
      title: 'Group dashboard aggregate-only privacy boundary',
      url: buildRoute(runCtx.baseUrl, runCtx.locale, '/agent/import'),
      requiredTestIds: ['group-dashboard-summary'],
      requiredPhrases: [
        'Aggregate group access dashboard',
        'This view stays aggregate-only. No claim facts, notes, or documents are visible here without explicit member consent.',
      ],
      forbiddenPhrases: ['KS A-Member 1', 'member.ks.a1@interdomestik.com'],
    },
  ];
}

function buildMatterAllowanceTestIds(definition) {
  const readyMarker = definition.requiresReadyMarker ? [`${definition.testIdPrefix}-ready`] : [];
  return readyMarker.concat(
    MATTER_ALLOWANCE_TEST_ID_SUFFIXES.map(suffix => `${definition.testIdPrefix}-${suffix}`)
  );
}

function buildMatterAndSlaEnforcementScenarios(runCtx) {
  const { buildRoute } = require('./shared.ts');
  return MATTER_AND_SLA_SCENARIO_DEFINITIONS.map(definition => ({
    id: definition.id,
    account: definition.account,
    title: definition.title,
    url: buildRoute(runCtx.baseUrl, runCtx.locale, definition.routePath),
    requiredTestIds: buildMatterAllowanceTestIds(definition),
    requiredPhrases: ['SLA Status', definition.slaCopy],
    expectedMatterAllowance: DEFAULT_MATTER_ALLOWANCE_VALUES,
  }));
}

function buildEscalationAgreementCollectionFallbackScenarios(runCtx) {
  const { buildRoute } = require('./shared.ts');
  return ESCALATION_AGREEMENT_COLLECTION_FALLBACK_SCENARIO_DEFINITIONS.map(definition => ({
    id: definition.id,
    account: definition.account,
    title: definition.title,
    url: buildRoute(runCtx.baseUrl, runCtx.locale, definition.routePath),
    requiredTestIds: [
      'staff-claim-detail-ready',
      'staff-accepted-recovery-prerequisites',
      'staff-escalation-agreement-summary',
      'staff-success-fee-collection-summary',
    ],
    requiredPrerequisitePhrases: definition.requiredPrerequisitePhrases,
    requiredPhrases: definition.requiredPhrases,
  }));
}

async function collectMatterAllowanceValues(page, requiredTestIds) {
  const suffixByKey = {
    used: 'matter-allowance-used',
    remaining: 'matter-allowance-remaining',
    total: 'matter-allowance-total',
  };
  const values = {};

  for (const [key, suffix] of Object.entries(suffixByKey)) {
    const testId = requiredTestIds.find(candidate => candidate.endsWith(suffix));
    values[key] = testId
      ? (
          await page
            .getByTestId(testId)
            .innerText({ timeout: TIMEOUTS.marker })
            .catch(() => '')
        ).trim()
      : '';
  }

  return values;
}

async function runG07(browser, runCtx, deps) {
  const { checkResult, compactErrorMessage, findMissingCommercialPromiseSections } = deps;
  const evidence = [];
  const signatures = [];
  const scenarios = buildCommercialPromiseScenarios(runCtx);

  for (const scenario of scenarios) {
    try {
      const { missing, observedSummary } = await visitReleaseGateScenario(
        browser,
        runCtx,
        scenario,
        async page => {
          const observedByTestId = await collectVisibleTestIds(page, scenario.requiredTestIds);
          return {
            missing: findMissingCommercialPromiseSections(
              scenario.requiredTestIds,
              observedByTestId
            ),
            observedSummary: scenario.requiredTestIds
              .map(testId => `${testId}=${observedByTestId[testId] === true}`)
              .join(','),
          };
        }
      );

      evidence.push(
        `scenario=${scenario.id} account=${scenario.account || 'public'} missing=${
          missing.join(',') || 'none'
        } observed=${observedSummary}`
      );

      if (missing.length > 0) {
        signatures.push(
          `G07_COMMERCIAL_PROMISE_SURFACE_MISSING scenario=${scenario.id} missing=${missing.join(',')}`
        );
      }
    } catch (error) {
      signatures.push(
        `G07_EXCEPTION scenario=${scenario.id} message=${compactErrorMessage(error?.message || error, 650)}`
      );
    }
  }

  return checkResult('G07', signatures.length ? 'FAIL' : 'PASS', evidence, signatures);
}

async function runG08(browser, runCtx, deps) {
  const {
    checkResult,
    compactErrorMessage,
    findMissingBoundaryPhrases,
    findMissingCommercialPromiseSections,
    findPresentBoundaryLeaks,
    normalizeBoundaryText,
  } = deps;
  const evidence = [];
  const signatures = [];
  const scenarios = buildFreeStartGroupPrivacyScenarios(runCtx);

  for (const scenario of scenarios) {
    try {
      const { missingPhrases, missingTestIds, observedSummary, presentLeaks } =
        await visitReleaseGateScenario(browser, runCtx, scenario, async page => {
          const observedByTestId = await collectVisibleTestIds(page, scenario.requiredTestIds);
          const observedText = normalizeBoundaryText(
            await page
              .locator('body')
              .innerText()
              .catch(() => '')
          );

          return {
            missingPhrases: findMissingBoundaryPhrases(scenario.requiredPhrases, observedText),
            missingTestIds: findMissingCommercialPromiseSections(
              scenario.requiredTestIds,
              observedByTestId
            ),
            observedSummary: scenario.requiredTestIds
              .map(testId => `${testId}=${observedByTestId[testId] === true}`)
              .join(','),
            presentLeaks: findPresentBoundaryLeaks(scenario.forbiddenPhrases, observedText),
          };
        });

      evidence.push(
        `scenario=${scenario.id} account=${scenario.account || 'public'} missing_testids=${
          missingTestIds.join(',') || 'none'
        } missing_phrases=${missingPhrases.join(',') || 'none'} present_leaks=${
          presentLeaks.join(',') || 'none'
        } observed=${observedSummary}`
      );

      if (missingTestIds.length > 0) {
        signatures.push(
          `G08_BOUNDARY_SURFACE_MISSING scenario=${scenario.id} missing=${missingTestIds.join(',')}`
        );
      }
      if (missingPhrases.length > 0) {
        signatures.push(
          `G08_BOUNDARY_COPY_MISSING scenario=${scenario.id} missing=${missingPhrases.join(',')}`
        );
      }
      if (presentLeaks.length > 0) {
        signatures.push(
          `G08_PRIVACY_LEAK_DETECTED scenario=${scenario.id} leaks=${presentLeaks.join(',')}`
        );
      }
    } catch (error) {
      signatures.push(
        `G08_EXCEPTION scenario=${scenario.id} message=${compactErrorMessage(error?.message || error, 650)}`
      );
    }
  }

  return checkResult('G08', signatures.length ? 'FAIL' : 'PASS', evidence, signatures);
}

async function runG09(browser, runCtx, deps) {
  const {
    checkResult,
    compactErrorMessage,
    findMissingBoundaryPhrases,
    findMissingCommercialPromiseSections,
    findMismatchedMatterAllowanceValues,
    normalizeBoundaryText,
  } = deps;
  const evidence = [];
  const signatures = [];
  const scenarios = buildMatterAndSlaEnforcementScenarios(runCtx);

  for (const scenario of scenarios) {
    try {
      const {
        matterAllowanceMismatches,
        missingPhrases,
        missingTestIds,
        observedSummary,
        observedValues,
      } = await visitReleaseGateScenario(browser, runCtx, scenario, async page => {
        const observedByTestId = await collectVisibleTestIds(page, scenario.requiredTestIds);
        const observedText = normalizeBoundaryText(
          await page
            .locator('body')
            .innerText()
            .catch(() => '')
        );
        const observedValues = await collectMatterAllowanceValues(page, scenario.requiredTestIds);

        return {
          matterAllowanceMismatches: findMismatchedMatterAllowanceValues(
            scenario.expectedMatterAllowance,
            observedValues
          ),
          missingPhrases: findMissingBoundaryPhrases(scenario.requiredPhrases, observedText),
          missingTestIds: findMissingCommercialPromiseSections(
            scenario.requiredTestIds,
            observedByTestId
          ),
          observedSummary: scenario.requiredTestIds
            .map(testId => `${testId}=${observedByTestId[testId] === true}`)
            .join(','),
          observedValues,
        };
      });

      evidence.push(
        `scenario=${scenario.id} account=${scenario.account} missing_testids=${
          missingTestIds.join(',') || 'none'
        } missing_phrases=${missingPhrases.join(',') || 'none'} mismatches=${
          matterAllowanceMismatches.join(',') || 'none'
        } values=used:${observedValues.used || 'missing'}|remaining:${observedValues.remaining || 'missing'}|total:${observedValues.total || 'missing'} observed=${observedSummary}`
      );

      if (missingTestIds.length > 0) {
        signatures.push(
          `G09_SURFACE_MISSING scenario=${scenario.id} missing=${missingTestIds.join(',')}`
        );
      }
      if (missingPhrases.length > 0) {
        signatures.push(
          `G09_SLA_COPY_MISSING scenario=${scenario.id} missing=${missingPhrases.join(',')}`
        );
      }
      if (matterAllowanceMismatches.length > 0) {
        signatures.push(
          `G09_MATTER_ALLOWANCE_MISMATCH scenario=${scenario.id} ${matterAllowanceMismatches.join(' ')}`
        );
      }
    } catch (error) {
      signatures.push(
        `G09_EXCEPTION scenario=${scenario.id} message=${compactErrorMessage(error?.message || error, 650)}`
      );
    }
  }

  return checkResult('G09', signatures.length ? 'FAIL' : 'PASS', evidence, signatures);
}

async function runG10(browser, runCtx, deps) {
  const {
    checkResult,
    compactErrorMessage,
    findMissingBoundaryPhrases,
    findMissingCommercialPromiseSections,
    normalizeBoundaryText,
    routePathsMatch,
  } = deps;
  const evidence = [];
  const signatures = [];
  const scenarios = buildEscalationAgreementCollectionFallbackScenarios(runCtx);

  for (const scenario of scenarios) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await seedCookieConsentState({ context, page, baseUrl: runCtx.baseUrl });
      await loginWithRunContext(page, runCtx, scenario.account);
      if (/\/login(?:[/?#]|$)/.test(page.url())) {
        await loginWithRunContext(page, runCtx, scenario.account);
      }
      const resolved = await resolveG10Scenario(page, runCtx, scenario, {
        findMissingBoundaryPhrases,
        findMissingCommercialPromiseSections,
        normalizeBoundaryText,
        routePathsMatch,
      });

      evidence.push(
        `scenario=${scenario.id} account=${scenario.account} missing_testids=${
          resolved.missingTestIds.join(',') || 'none'
        } missing_prerequisites=${resolved.missingPrerequisitePhrases.join(',') || 'none'} missing_phrases=${
          resolved.missingPhrases.join(',') || 'none'
        } observed=${resolved.observedSummary} source=${resolved.source} final_url=${resolved.finalUrl} attempted=${resolved.attemptedUrls.join(' | ')} prerequisites="${resolved.observedPrerequisites || 'missing'}"`
      );

      if (!resolved.matched) {
        signatures.push(
          `G10_MISCONFIG_SCENARIO_UNRESOLVED scenario=${scenario.id} final_url=${resolved.finalUrl}`
        );
        continue;
      }
      if (resolved.missingTestIds.length > 0) {
        signatures.push(
          `G10_SURFACE_MISSING scenario=${scenario.id} missing=${resolved.missingTestIds.join(',')}`
        );
      }
      if (resolved.missingPrerequisitePhrases.length > 0 || resolved.missingPhrases.length > 0) {
        signatures.push(
          `G10_COLLECTION_FALLBACK_COPY_MISSING scenario=${scenario.id} missing=${[
            ...resolved.missingPrerequisitePhrases,
            ...resolved.missingPhrases,
          ].join(',')}`
        );
      }
    } catch (error) {
      signatures.push(
        `G10_EXCEPTION scenario=${scenario.id} message=${compactErrorMessage(error?.message || error, 650)}`
      );
    } finally {
      await context.close();
    }
  }

  return checkResult('G10', signatures.length ? 'FAIL' : 'PASS', evidence, signatures);
}

module.exports = {
  buildCommercialPromiseScenarios,
  buildEscalationAgreementCollectionFallbackScenarios,
  buildFreeStartGroupPrivacyScenarios,
  buildMatterAndSlaEnforcementScenarios,
  runG07,
  runG08,
  runG09,
  runG10,
};
