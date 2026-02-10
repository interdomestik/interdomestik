# Deployment Workflow

We use a **Production Branch Workflow** to ensure strict control over releases.

## Branches

| Branch       | Environment | Build Trigger | Purpose                                               |
| :----------- | :---------- | :------------ | :---------------------------------------------------- |
| `main`       | Preview     | On Push/PR    | Daily development. **Does not deploy to production.** |
| `production` | Production  | On Merge      | Stable releases. Locked branch.                       |

## 🚀 How to Deploy to Production (Release Checklist)

We strictly use **Pull Requests** to deploy to production. Do not push directly.

1.  **Verify `main` is Stable**
    - [ ] CI Checks (`e2e:gate`, `lint`, `type-check`) are GREEN on `main`.
    - [ ] Manual QA passed on the Preview environment.

2.  **Create Release PR**
    - [ ] Open a PR: `main` ➡️ `production`.
    - [ ] Title: `release: vX.Y.Z` (or `release: <date> - <feature>`).
    - [ ] Review the "Files Changed" tab to confirm exactly what is going live.

3.  **Merge & Monitor**
    - [ ] **Squash and Merge** (or Rebase) the PR.
    - [ ] Monitor the **Vercel Production Deployment** in the Vercel Dashboard.
    - [ ] Verify the live site: [https://interdomestik.com](https://interdomestik.com) (or your prod domain).

## 🛡️ Recommended Configurations

### GitHub Branch Protection (Critical)

Configure these settings for the `production` branch in GitHub:

- [x] **Require pull request before merging**
- [x] **Require status checks to pass before merging** (Select `e2e:gate`, `Verel`, etc.)
- [x] **Require linear history** (Optional, keeps history clean)
- [x] **Include administrators** (Enforce rules on everyone)

### Vercel Project Settings

Ensure these are set in Vercel to prevent accidental builds:

- **Settings > Environments > Production > Branch Tracking**: `production`
- **Settings > Git > Ignore Build Command**: _(Leave Empty)_
- **Settings > Build & Development > Build Command**: `pnpm turbo build --filter=@interdomestik/web`
