# AI Eval Fixtures

This directory contains the deterministic AI fixture suite used for `AI06`.

## Command

```bash
pnpm ai:eval
```

The runner executes fixture-based checks for:

- `policy_extract`
- `claim_summary`
- `legal_doc_extract`

## Metrics

The suite reports:

- schema validity rate
- key-field accuracy rate
- hallucination rate
- human acceptance rate
- average latency per workflow
- average cost per run
- cached input token rate

## Notes

- The suite is deterministic and does not call network models.
- Policy extraction currently evaluates through a normalization shim because the live policy analyzer still emits a UI-oriented shape instead of the strict `policyExtractSchema` contract.
- The GitHub `ai-eval` CI job is PR-only and non-blocking. It runs only when AI-related files change.
