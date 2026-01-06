# Knip Baseline Report

**Date**: 2026-01-05
**Status**: Initial Scan

## Overview

The initial scan with `knip` successfully analyzed the monorepo. As expected with a fresh configuration in a large monorepo, there are numerous findings.

### findings Summary

- **Total Types**: ~100+ reported unused types (likely false positives due to implicit usage in generic components or server actions).
- **Files**: Serveral files flagged, particularly in `actions/*`.
- **Dependencies**: Missing peer dependencies identified in `domain-*` packages (e.g., `postcss`).

### Missing Peer Dependencies

The scan highlighted missing peer dependencies that should be addressed:

- `packages/domain-activities`: missing `postcss`
- `packages/domain-membership-billing`: missing `postcss`
- `packages/domain-referrals`: missing `postcss`

### Next Steps

1. **Whitelist**: Refine `knip.json` to ignore known false positives (e.g., specific `actions` patterns if they are dynamic).
2. **Cleanup**: Systematically review and remove confirmed unused types.
3. **Fix Peers**: Install missing peer dependencies in the respective packages.

## Raw Data

A raw JSON report can be generated using `pnpm knip --reporter json`.
