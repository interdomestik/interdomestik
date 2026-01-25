# Pull Request Management Recommendations

## Executive Summary

You have **2 open pull requests** that need attention:
- **PR #3**: Ready to merge (after resolving conflicts)
- **PR #4**: Needs significant work before merging

---

## PR #3: fix(e2e): unblock seed cleanup and align share-pack contract

### Status: ✅ READY TO MERGE (after conflict resolution)

### Details
- **Branch**: `chore/quarantine-burndown-2026-01-21`
- **Size**: 6 commits, +1,445/-295 lines, 43 files
- **Created**: 2026-01-21
- **Last Updated**: 2026-01-21

### What Changed
- Fixed seed cleanup ordering: delete share_packs rows before users (prevents FK violations)
- Aligned E2E share-pack tests to expect 404 for invalid tokens (matches API contract)
- Added MK share-pack document (doc-mk-1) to seed data

### Verification Status
✅ **All tests passing** (verified by author):
- `pnpm e2e:gate` (KS + MK): PASS
- `seed:e2e --reset`: PASS

### Review Feedback
✨ **Minor**: One style comment about cleanup consistency (optional improvement)

### Merge Status
⚠️ **Has merge conflicts** (`mergeable_state: dirty`)

### Recommended Actions for PR #3

**PRIORITY: HIGH - Ready to merge once conflicts resolved**

1. **Resolve Merge Conflicts**
   ```bash
   git checkout chore/quarantine-burndown-2026-01-21
   git pull origin main
   # Resolve any conflicts
   git push
   ```

2. **Optional: Address Style Comment**
   - Review comment about standardizing cleanup approach
   - Low priority, cosmetic improvement

3. **Merge**
   - Once conflicts resolved, this PR is ready to merge
   - All tests verified as passing
   - Changes are focused and well-tested

---

## PR #4: Chore/quarantine burndown phase 3

### Status: ⚠️ NOT READY - Needs Work

### Details
- **Branch**: `chore/quarantine-burndown-phase-3`
- **Size**: 154 commits, +17,409/-13,753 lines, 221 files
- **Created**: 2026-01-25
- **Last Updated**: 2026-01-25

### What Changed
Large-scale cleanup and stabilization work across the codebase

### Critical Issues

#### 🔴 SECURITY ISSUE - MUST FIX
**GitGuardian detected hardcoded secret**
- **File**: `.github/workflows/e2e-pr.yml`, line 21
- **Type**: Generic Password
- **Commit**: `7a35f096c7df414dc497bd42734e8cb55962b5e6`
- **Action Required**: 
  1. Move secret to GitHub Secrets
  2. Update workflow to use `${{ secrets.SECRET_NAME }}`
  3. Revoke and rotate the exposed secret
  4. Consider rewriting git history if sensitive

#### 🔴 CRITICAL CODE ISSUES

1. **Missing Pre-Commit Script**
   - **File**: `.husky/pre-commit`, line 27
   - **Issue**: References `./scripts/secrets-precommit.sh` which doesn't exist
   - **Action**: Either create the script or remove the reference

2. **GitHub Actions Syntax Errors** (Multiple files)
   - **File**: `.github/workflows/e2e-nightly.yml`
   - **Issue**: Spaces before version numbers in `uses:` directives
   - **Examples**: 
     - `actions/checkout @v4` → `actions/checkout@v4`
     - `actions/setup-node @v4` → `actions/setup-node@v4`
   - **Impact**: These workflows will fail to run

3. **Domain Code Quality Issues**
   - **File**: `packages/domain-leads/src/create.ts`, line 49-52
   - **Issue 1**: `onConflictDoUpdate` only updates `updatedAt`, not other fields
   - **Issue 2**: Fallback logic returns original `leadId` even if insert fails
   - **Impact**: Could lead to data inconsistency

#### 🟡 CODE QUALITY ISSUES

4. **Unused Variables**
   - `actionPanel` in `apps/web/e2e/staff-flow.spec.ts`
   - `Link` in `apps/web/src/components/pricing/pricing-table.tsx`
   - `NextResponse` in `apps/web/src/middleware.ts`

### Merge Status
⚠️ **Has merge conflicts** (`mergeable_state: dirty`)

### Recommended Actions for PR #4

**PRIORITY: CRITICAL - Do NOT merge until all issues resolved**

#### Phase 1: Security (DO FIRST)
1. **Fix hardcoded secret immediately**
   ```bash
   # In .github/workflows/e2e-pr.yml, replace hardcoded value with:
   ${{ secrets.YOUR_SECRET_NAME }}
   ```
2. **Add secret to GitHub**
   - Go to repository Settings > Secrets and Variables > Actions
   - Add the secret value
3. **Rotate the exposed secret** in the actual service
4. **Consider**: Rewrite git history to remove from all commits

#### Phase 2: Critical Fixes
5. **Fix GitHub Actions syntax errors**
   - Remove spaces: `actions/checkout@v4`, `actions/setup-node@v4`
   
6. **Fix or remove pre-commit hook reference**
   - Either create `./scripts/secrets-precommit.sh`
   - Or remove the line from `.husky/pre-commit`

7. **Fix domain-leads code quality**
   - Update conflict resolution to update all relevant fields
   - Improve error handling for failed inserts

#### Phase 3: Quality
8. **Clean up unused code**
   - Remove unused variables and imports

#### Phase 4: Verification
9. **Run all tests**
   ```bash
   pnpm check        # Full validation
   pnpm test         # Unit tests
   pnpm test:e2e     # E2E tests
   ```

10. **Resolve merge conflicts**

11. **Get another code review** after fixes

---

## Recommended Merge Order

1. **First**: PR #3 (after conflict resolution)
   - Smaller, focused, tested, ready
   - Will reduce conflicts for PR #4

2. **Second**: PR #4 (after all fixes complete)
   - Large, complex, needs significant work
   - Should be split into smaller PRs if possible

---

## General Recommendations

### For PR #4 Specifically
Given the size (154 commits, 221 files), consider:
- **Splitting into smaller PRs** by feature/domain
- Easier to review
- Easier to test
- Easier to rollback if issues arise
- Reduces merge conflict complexity

### Process Improvements
1. **Enable Required Status Checks**
   - Block merges when tests fail
   - Block merges when security issues detected

2. **Pre-commit Hooks**
   - Ensure secrets detection works locally
   - Run linters before commit

3. **PR Size Guidelines**
   - Keep PRs under ~20 files when possible
   - Makes review more thorough and faster

---

## Quick Action Checklist

### For PR #3 ✅
- [ ] Resolve merge conflicts
- [ ] Merge to main
- [ ] Delete branch

### For PR #4 ⚠️
- [ ] **CRITICAL**: Fix hardcoded secret in workflows
- [ ] **CRITICAL**: Rotate exposed secret
- [ ] Fix GitHub Actions syntax errors
- [ ] Fix pre-commit hook reference
- [ ] Fix domain-leads code quality
- [ ] Remove unused code
- [ ] Run full test suite
- [ ] Resolve merge conflicts
- [ ] Get code review
- [ ] Consider splitting into smaller PRs

---

## Need Help?

If you need assistance with any of these steps, feel free to ask. The most critical action is addressing the security issue in PR #4.
