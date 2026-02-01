# CI/CD Pipeline Architecture

## Overview

This document outlines the Continuous Integration (CI) and Continuous Deployment (CD) architecture for the **Interdomestik Crystal Home** project.

The pipeline is designed to ensure:

1.  **Code Quality**: Strict gates for linting, types, and tests on every Pull Request.
2.  **Reliability**: Automated E2E testing before merging and after deployment.
3.  **Security**: Vulnerability scanning and strict artifact management.
4.  **Delivery**: Automated Docker builds and staged deployments.

## 1. CI Pipeline (The Gate)

**File**: `.github/workflows/ci.yml`
**Trigger**: Pull Requests to `main`

| Stage               | Jobs       | Description                                                              |
| ------------------- | ---------- | ------------------------------------------------------------------------ |
| **Audit**           | `audit`    | Runs `pnpm audit` and license checks. Fails on high severity.            |
| **Static Analysis** | `static`   | Runs ESLint, Prettier, and TypeScript (`tsc`). Fail fast.                |
| **Unit Tests**      | `unit`     | Runs Vitest suite.                                                       |
| **E2E Gate**        | `e2e-gate` | Runs Playwright tests against a local build with a service container DB. |

**Policy**: All jobs must pass before merging.

## 2. CD Pipeline (The Release)

**File**: `.github/workflows/cd.yml`
**Trigger**: Push to `main` (Post-merge)

| Stage              | Jobs             | Description                                                                                       |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------- |
| **Build & Push**   | `build-push`     | Builds `apps/web/Dockerfile`. Pushes image to `ghcr.io/interdomestik/web`. Tags: `sha`, `latest`. |
| **Deploy Staging** | `deploy-staging` | Deploys the `sha` tag to the Staging environment.                                                 |
| **Verify Staging** | `e2e-staging`    | Runs smoke tests against the live Staging URL.                                                    |
| **Approval**       | _Gate_           | Requires manual approval in GitHub Environments (`production`) to proceed.                        |
| **Deploy Prod**    | `deploy-prod`    | Deploys the `sha` tag to Production.                                                              |
| **Verify Prod**    | `verify-prod`    | Health check and critical path smoke test on Production.                                          |

## 3. Artifact Management

- **Registry**: GitHub Container Registry (GHCR)
- **Image Name**: `ghcr.io/<owner>/interdomestik-web`
- **Tagging Strategy**:
  - `main` branch: `sha-<short_sha>`, `latest`
  - `tags` (v\*): `v1.0.0`, `v1.0`

## 4. Environment Variables

Managed via GitHub Secrets:

- `DATABASE_URL`: Connection string for Postgres.
- `NEXT_PUBLIC_APP_URL`: Public URL.
- `BETTER_AUTH_SECRET`: Auth secret.
- `RESEND_API_KEY`: Email service.
- `UPSTASH_*`: Rate limiting.

## 5. Rollback Strategy

**Manual Rollback via Revert**:

1.  Revert the PR/Commit in Git.
2.  Push to `main`.
3.  CD Pipeline runs and deploys the previous version.

**Fast Rollback (Infrastructure)**:

- If using Kubernetes/Docker Swarm: `kubectl rollout undo deployment/web`
- If using Vercel: Click "Rollback" in UI.

## 6. Future Enhancements

- **Semantic Release**: Automated changelog and version tagging.
- **Blue/Green Deployment**: Zero-downtime switchover (requires infrastructure support).
- **Canary Analysis**: Gradual traffic shifting.
