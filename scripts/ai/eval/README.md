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
- Policy extraction now validates the analyzer output directly against `policyExtractSchema`; sparse and adversarial fixtures assert unsupported facts stay null with warnings instead of being fabricated.
- CI runs the fixture suite as a blocking lane for AI-surface PRs and for mainline pushes.
- The release-candidate command pack runs the same fixture suite as blocking release proof.
