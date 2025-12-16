# Task: Build Agent Workspace MVP

> Status: In Progress
> Type: Feature
> Priority: P1
> Started: 2025-12-16

## 🎯 Objective

Create a secure, functional workspace for Agents to view, manage, and process consumer claims.

## 📝 Context

- **Previous Work**: Database seeded with users/claims. E2E tests verified user flow.
- **Goal**: Enable `agent` role users to triage and move claims through the lifecycle.

## ✅ Definition of Done (DoD)

- [ ] **Access Control**: `/agent` routes protected (Agent role only).
- [ ] **Dashboard**: specialized view for agents (not just specific user claims).
- [ ] **Queue Management**: Filter by status (Submitted, Verification, etc.).
- [ ] **Triage Actions**: Ability to Accept (Approve) or Reject claims.
- [ ] **Claim Processing**: Update status/stage.
- [ ] **E2E Tests**: Verify full agent lifecycle.

## 🛠 Implementation Plan

1.  **Layout & Routing**: `/app/[locale]/(agent)/...` with RBAC.
2.  **Components**: `AgentClaimList`, `AgentClaimDetail`, `TriageControls`.
3.  **Server Actions**: `updateClaimStatus`, `getAgentClaims` (unfiltered by userId).
4.  **Verification**: E2E test `agent-flow.spec.ts`.

## 🧪 Testing Strategy

- Use seeded `agent@interdomestik.com`.
- Verify Agent can see ALL claims (unlike regular user).
- Verify Role protection (User cannot access Agent routes).
