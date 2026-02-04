# Pnpm Audit Allowlist Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make pnpm audit gating stable by centralizing the allowlist and eliminating per-workflow edits for each known advisory.

**Architecture:** Add a repository-level allowlist file consumed by `scripts/pnpm-audit-gate.mjs`, keep CLI args as overrides, and update the security workflow to rely on the allowlist file.

**Tech Stack:** Node.js, pnpm, GitHub Actions

---

### Task 1: Add allowlist file

**Files:**

- Create: `scripts/pnpm-audit-allowlist.json`

**Step 1: Write the allowlist file**

```json
{
  "allowlist": ["GHSA-3966-f6p6-2qr9", "GHSA-j965-2qgj-vjmq", "1112810"]
}
```

**Step 2: Commit**

```bash
git add scripts/pnpm-audit-allowlist.json
git commit -m "ci(security): add pnpm audit allowlist"
```

### Task 2: Update the audit gate script

**Files:**

- Modify: `scripts/pnpm-audit-gate.mjs`

**Step 1: Update script to load allowlist file**

- Load from `scripts/pnpm-audit-allowlist.json` if present.
- Accept an optional allowlist file path argument.
- Keep CLI args as additional allowlist entries.

**Step 2: Run script on a sample audit json (optional)**

```bash
node scripts/pnpm-audit-gate.mjs /tmp/pnpm-audit.json
```

**Step 3: Commit**

```bash
git add scripts/pnpm-audit-gate.mjs
git commit -m "ci(security): load pnpm audit allowlist file"
```

### Task 3: Update workflow to use allowlist file

**Files:**

- Modify: `.github/workflows/security.yml`

**Step 1: Remove hardcoded advisory IDs from the workflow**

- Call the script with just the audit JSON path.

**Step 2: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "ci(security): use pnpm audit allowlist file in workflow"
```

### Task 4: Verify

**Step 1: Re-run the Security workflow on the PR**
**Step 2: Confirm pnpm-audit is green**
