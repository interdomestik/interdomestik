import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { analyzePolicyText } from '../../../apps/web/src/lib/ai/policy-analyzer.ts';
import { summarizeClaim } from '../../../packages/domain-ai/src/claims/summary.ts';
import { extractLegalDocument } from '../../../packages/domain-ai/src/legal/extract.ts';
import { claimSummarySchema } from '../../../packages/domain-ai/src/schemas/claim-summary.ts';
import { legalDocExtractSchema } from '../../../packages/domain-ai/src/schemas/legal-doc-extract.ts';
import { policyExtractSchema } from '../../../packages/domain-ai/src/schemas/policy-extract.ts';
import { aggregateAiTelemetry, createAiTelemetryEvent } from '../../../packages/domain-ai/src/telemetry.ts';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATASET_FILES = [
  'policy-extract.dataset.json',
  'claim-summary.dataset.json',
  'legal-extract.dataset.json',
];

const WORKFLOW_RUNNERS = {
  policy_extract: {
    execute: async input => analyzePolicyText(String(input.documentText ?? '')),
    normalizeForSchema: normalizePolicyAnalysisForEval,
    schema: policyExtractSchema,
  },
  claim_summary: {
    execute: async input => summarizeClaim(input),
    normalizeForSchema: value => value,
    schema: claimSummarySchema,
  },
  legal_doc_extract: {
    execute: async input => extractLegalDocument(input),
    normalizeForSchema: value => value,
    schema: legalDocExtractSchema,
  },
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseNonNegativeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replaceAll(',', '').trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return 0;
}

function dedupeStrings(values) {
  return Array.from(
    new Set(values.map(value => normalizeText(value)).filter(Boolean))
  );
}

function normalizePolicyAnalysisForEval(rawOutput) {
  const provider = normalizeText(rawOutput?.provider);
  const policyNumber = normalizeText(rawOutput?.policyNumber);
  const coverageAmount = parseNonNegativeNumber(rawOutput?.coverageAmount);
  const deductible = parseNonNegativeNumber(rawOutput?.deductible);
  const currency = normalizeText(rawOutput?.currency) || 'EUR';
  const warnings = [];

  if (!provider) {
    warnings.push('Provider could not be extracted from the uploaded policy.');
  }
  if (!policyNumber) {
    warnings.push('Policy number could not be extracted from the uploaded policy.');
  }
  if (coverageAmount === 0) {
    warnings.push('Coverage amount could not be extracted from the uploaded policy.');
  }
  if (deductible === 0) {
    warnings.push('Deductible could not be extracted from the uploaded policy.');
  }

  return {
    provider: provider || 'Unknown provider',
    policyNumber: policyNumber || 'Unknown policy number',
    coverageAmount,
    currency,
    deductible,
    confidence: normalizeText(rawOutput?.summary) ? 0.68 : 0.32,
    warnings: dedupeStrings([...(rawOutput?.warnings ?? []), ...warnings]),
  };
}

function valueContains(actualValue, expectedFragment) {
  if (typeof actualValue === 'string') {
    return actualValue.includes(expectedFragment);
  }

  if (Array.isArray(actualValue)) {
    return actualValue.some(
      value => typeof value === 'string' && value.includes(expectedFragment)
    );
  }

  return false;
}

function hasMaterialValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function formatValue(value) {
  return JSON.stringify(value);
}

function evaluateExpected(args) {
  const { caseId, exact = {}, contains = {}, mustBeAbsent = [], output, rawOutput } = args;
  let totalExpectedFields = 0;
  let matchedFields = 0;
  const failures = [];
  let hallucinated = false;

  for (const [key, expectedValue] of Object.entries(exact)) {
    totalExpectedFields += 1;
    if (Object.is(output?.[key], expectedValue)) {
      matchedFields += 1;
      continue;
    }

    failures.push(
      `${caseId}: expected ${key}=${formatValue(expectedValue)} but received ${formatValue(output?.[key])}`
    );
  }

  for (const [key, fragments] of Object.entries(contains)) {
    const expectedFragments = Array.isArray(fragments) ? fragments : [fragments];

    for (const fragment of expectedFragments) {
      totalExpectedFields += 1;
      if (valueContains(output?.[key], fragment)) {
        matchedFields += 1;
        continue;
      }

      failures.push(
        `${caseId}: expected ${key} to contain ${formatValue(fragment)} but received ${formatValue(output?.[key])}`
      );
    }
  }

  for (const key of mustBeAbsent) {
    const rawValue = rawOutput?.[key];
    if (!hasMaterialValue(rawValue)) {
      continue;
    }

    hallucinated = true;
    failures.push(
      `${caseId}: expected ${key} to remain empty but received ${formatValue(rawValue)}`
    );
  }

  return {
    totalExpectedFields,
    matchedFields,
    hallucinated,
    failures,
  };
}

function roundMetric(value) {
  return Number(value.toFixed(4));
}

async function loadDataset(fileName) {
  const content = await fs.readFile(path.join(SCRIPT_DIR, fileName), 'utf8');
  return JSON.parse(content);
}

async function evaluateDataset(dataset) {
  const runner = WORKFLOW_RUNNERS[dataset.workflow];
  if (!runner) {
    throw new Error(`Unsupported workflow in dataset: ${dataset.workflow}`);
  }

  const caseResults = [];

  for (const testCase of dataset.cases) {
    const rawOutput = await runner.execute(testCase.input);
    const output = runner.normalizeForSchema(rawOutput);
    const schemaResult = runner.schema.safeParse(output);
    const evaluation = evaluateExpected({
      caseId: testCase.id,
      output,
      rawOutput,
      ...testCase.expected,
    });
    const failures = [...evaluation.failures];

    if (!schemaResult.success) {
      failures.push(
        `${testCase.id}: schema validation failed: ${schemaResult.error.issues
          .map(issue => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
          .join('; ')}`
      );
    }

    caseResults.push({
      caseId: testCase.id,
      workflow: dataset.workflow,
      schemaValid: schemaResult.success,
      totalExpectedFields: evaluation.totalExpectedFields,
      matchedFields: evaluation.matchedFields,
      hallucinated: evaluation.hallucinated,
      failures,
      telemetryEvent: createAiTelemetryEvent({
        workflow: dataset.workflow,
        ...testCase.telemetry,
      }),
    });
  }

  return caseResults;
}

function aggregateEvalResults(caseResults) {
  const totalCases = caseResults.length;
  const schemaValidCases = caseResults.filter(result => result.schemaValid).length;
  const hallucinatedCases = caseResults.filter(result => result.hallucinated).length;
  const totalExpectedFields = caseResults.reduce(
    (sum, result) => sum + result.totalExpectedFields,
    0
  );
  const matchedFields = caseResults.reduce((sum, result) => sum + result.matchedFields, 0);
  const telemetry = aggregateAiTelemetry(caseResults.map(result => result.telemetryEvent));
  const byWorkflow = {};

  for (const result of caseResults) {
    const existing = byWorkflow[result.workflow] ?? [];
    existing.push(result);
    byWorkflow[result.workflow] = existing;
  }

  return {
    totalCases,
    schemaValidityRate: totalCases > 0 ? roundMetric(schemaValidCases / totalCases) : 0,
    keyFieldAccuracyRate:
      totalExpectedFields > 0 ? roundMetric(matchedFields / totalExpectedFields) : 0,
    hallucinationRate: totalCases > 0 ? roundMetric(hallucinatedCases / totalCases) : 0,
    telemetry,
    byWorkflow: Object.fromEntries(
      Object.entries(byWorkflow).map(([workflow, results]) => {
        const workflowCases = results;
        const workflowExpectedFields = workflowCases.reduce(
          (sum, result) => sum + result.totalExpectedFields,
          0
        );
        const workflowMatchedFields = workflowCases.reduce(
          (sum, result) => sum + result.matchedFields,
          0
        );
        const workflowTelemetry = telemetry.byWorkflow[workflow];

        return [
          workflow,
          {
            cases: workflowCases.length,
            schemaValidityRate: roundMetric(
              workflowCases.filter(result => result.schemaValid).length / workflowCases.length
            ),
            keyFieldAccuracyRate:
              workflowExpectedFields > 0
                ? roundMetric(workflowMatchedFields / workflowExpectedFields)
                : 0,
            hallucinationRate: roundMetric(
              workflowCases.filter(result => result.hallucinated).length / workflowCases.length
            ),
            humanAcceptanceRate: workflowTelemetry?.humanAcceptanceRate ?? 0,
            averageLatencyMs: workflowTelemetry?.averageLatencyMs ?? 0,
            averageCostUsd: workflowTelemetry?.averageCostUsd ?? 0,
            cachedInputTokenRate: workflowTelemetry?.cachedInputTokenRate ?? 0,
          },
        ];
      })
    ),
  };
}

function printSummary(summary) {
  console.log('AI fixture eval summary');
  console.log(`- cases: ${summary.totalCases}`);
  console.log(`- schema validity rate: ${summary.schemaValidityRate}`);
  console.log(`- key-field accuracy rate: ${summary.keyFieldAccuracyRate}`);
  console.log(`- hallucination rate: ${summary.hallucinationRate}`);
  console.log(`- human acceptance rate: ${summary.telemetry.humanAcceptanceRate}`);
  console.log(`- average latency ms: ${summary.telemetry.averageLatencyMs}`);
  console.log(`- average cost usd: ${summary.telemetry.averageCostUsd}`);
  console.log(`- cached input token rate: ${summary.telemetry.cachedInputTokenRate}`);
  console.log('');
  console.log('Per workflow');

  for (const [workflow, workflowSummary] of Object.entries(summary.byWorkflow)) {
    console.log(
      `- ${workflow}: cases=${workflowSummary.cases} schema=${workflowSummary.schemaValidityRate} accuracy=${workflowSummary.keyFieldAccuracyRate} hallucination=${workflowSummary.hallucinationRate} accept=${workflowSummary.humanAcceptanceRate} latency_ms=${workflowSummary.averageLatencyMs} cost_usd=${workflowSummary.averageCostUsd} cached_rate=${workflowSummary.cachedInputTokenRate}`
    );
  }
}

async function main() {
  const datasets = await Promise.all(DATASET_FILES.map(loadDataset));
  const caseResults = (await Promise.all(datasets.map(evaluateDataset))).flat();
  const failures = caseResults.flatMap(result => result.failures);
  const summary = aggregateEvalResults(caseResults);

  printSummary(summary);

  if (failures.length > 0) {
    console.error('');
    console.error('AI fixture eval failures');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('');
  console.log('PASS fixture-based AI evals');
}

await main();
