# Interdomestik — App Flowchart (Illustration)

This document contains Mermaid diagrams you can render directly in VS Code (Markdown Preview) to create an illustration of the system.

---

## 1) Org Hierarchy + System Flowchart (Main Illustration)

```mermaid
flowchart TB
  %% Actors / Roles
  SuperAdmin([Super Admin\n(Global)])
  TenantAdmin([Tenant Admin\n(MK, XK, …)])
  BranchManager([Branch Manager\n(Branch)])
  Agent([Agent\n(Branch)\n(owns members)])
  Staff([Staff\n(Branch)\n(handles claims)])
  Member([Member\n(assigned to Agent)])

  %% Web UI
  %% Org model (conceptual)
  subgraph ORG[Organization Model]
    Tenant[(Tenant: MK / XK / …)]
    Branch[(Branch: Town)]
  end

  %% Web UI
  subgraph WEB_UI[apps/web — UI (Next.js)]
    MemberUI[Member Portal UI\n(/member/*)]
    AgentUI[Agent Workspace UI\n(/agent/*)]
    StaffUI[Staff Workspace UI\n(/staff/*)]
    AdminUI[Admin UI\n(/admin/*)]
    SuperAdminUI[Super Admin UI\n(/admin/* with global scope)]
  end

  %% Web App Backend Surface
  subgraph WEB_BACKEND[apps/web — Backend Surface]
    AuthAPI[Auth Route\n/api/auth/*]
    ClaimsActions[Claims Server Actions\nsrc/actions/claims.core.ts]
    StaffClaimsActions[Staff Claims Server Actions\nsrc/actions/staff-claims.core.ts]
    PaddleWebhook[Webhook Route\nPOST /api/webhooks/paddle]
  end

  %% Domain packages
  subgraph DOMAINS[packages/* — Domain Business Logic]
    DomainClaims[domain-claims\ncreate/submit/status/assign]
    DomainUsers[domain-users\nRBAC + agent assignment\nensure tenant]
    DomainBilling[domain-membership-billing\nsubscription + Paddle + webhooks]
    DomainComms[domain-communications\nemail + notifications]
    SharedAuth[shared-auth\nsession + tenant helpers]
  end

  %% Data + external providers
  subgraph DATA[packages/database]
    Drizzle[Drizzle ORM Schema]
    Postgres[(Postgres)]
  end

  Paddle((Paddle))
  Email((Email/Notifications))

  %% === Org hierarchy ===
  SuperAdmin --> SuperAdminUI
  TenantAdmin --> AdminUI
  BranchManager --> AdminUI
  Agent --> AgentUI
  Staff --> StaffUI
  Member --> MemberUI

  SuperAdmin --> Tenant
  TenantAdmin --> Tenant
  Tenant --> Branch
  BranchManager --> Branch
  Branch --> Agent
  Branch --> Staff
  Agent --> Member

  %% === Auth / tenant-scoped data ===
  MemberUI --> AuthAPI
  AgentUI --> AuthAPI
  StaffUI --> AuthAPI
  AdminUI --> AuthAPI
  SuperAdminUI --> AuthAPI

  AuthAPI --> SharedAuth
  SharedAuth --> Drizzle
  Drizzle --> Postgres

  %% === Claims (member) ===
  MemberUI --> ClaimsActions
  ClaimsActions --> SharedAuth
  ClaimsActions --> DomainClaims
  DomainClaims --> DomainBilling
  DomainClaims --> Drizzle
  DomainBilling --> Drizzle
  Drizzle --> Postgres
  DomainClaims --> DomainComms
  DomainComms --> Email

  %% === Membership billing/webhooks ===
  MemberUI --> Paddle
  Paddle --> PaddleWebhook
  PaddleWebhook --> DomainBilling
  DomainBilling --> Drizzle
  DomainBilling --> DomainComms

  %% === Staff/Admin claim operations ===
  StaffUI --> StaffClaimsActions
  AdminUI --> StaffClaimsActions
  SuperAdminUI --> StaffClaimsActions

  StaffClaimsActions --> SharedAuth
  StaffClaimsActions --> DomainClaims
  StaffClaimsActions --> DomainUsers

  DomainUsers --> SharedAuth
  DomainUsers --> Drizzle
  DomainClaims --> Drizzle

  DomainClaims --> DomainComms
```

---

## 2) Member → Membership → Claim → Agent/Branch/Tenant Oversight (Sequence)

```mermaid
sequenceDiagram
  participant M as Member
  participant UI as Next.js UI
  participant AUTH as Auth API
  participant SA as Server Actions
  participant CL as domain-claims
  participant BILL as domain-membership-billing
  participant DB as Postgres
  participant P as Paddle
  participant WH as Webhook Route
  participant COMMS as Notifications/Email
  participant AG as Agent Workspace (Members)
  participant ST as Staff Workspace (Claims)
  participant ADM as Admin (Tenant/Branch)

  M->>UI: Register/Login
  UI->>AUTH: /api/auth/*
  AUTH->>DB: session + user + tenant
  DB-->>AUTH: session
  AUTH-->>UI: cookie

  M->>UI: Click "Join Now"
  UI->>P: Open checkout
  P->>WH: POST /api/webhooks/paddle
  WH->>BILL: verify signature + parse
  BILL->>DB: persist webhook + update subscription
  BILL->>COMMS: send emails/notifications (if needed)
  WH-->>P: 200 OK

  M->>UI: Submit claim
  UI->>SA: submitClaim(...)
  SA->>CL: submitClaimCore(session, data)
  CL->>BILL: hasActiveMembership(userId, tenantId)
  BILL->>DB: read subscription state
  DB-->>BILL: active/inactive
  alt not active
    CL-->>SA: error (membership required)
    SA-->>UI: show error
  else active
    CL->>DB: insert claim (submitted) + docs
    CL->>COMMS: notifyClaimSubmitted
    SA-->>UI: success
    note over ST,ADM: Claim is now visible in staff + admin queues (scoped)
    note over AG: Member ownership remains under agent (member lists/referrals)
  end
```

---

## 3) Agent/Branch/Tenant Admin Claim Assignment + Status Updates (Sequence)

```mermaid
sequenceDiagram
  participant TA as Tenant Admin
  participant BA as Branch Manager
  participant UI as Admin UI
  participant SA as claims actions (staff/admin)
  participant ST as Staff (Handler)
  participant CL as domain-claims
  participant US as domain-users
  participant DB as Postgres
  participant COMMS as Notifications/Email

  TA->>UI: Assign claim to staff (within tenant)
  UI->>SA: assignClaim(claimId, staffId)
  SA->>US: RBAC/tenant checks
  SA->>CL: assignClaimCore(session, claimId, staffId)
  CL->>DB: update claim.staffId (and branchId/agentId if set)
  CL->>COMMS: notifyClaimAssigned (staff)
  SA-->>UI: success

  ST->>UI: Update claim status
  UI->>SA: updateClaimStatus(claimId, status)
  SA->>CL: updateClaimStatusCore(...)
  CL->>DB: update claim.status + history
  CL->>COMMS: notifyStatusChanged
  SA-->>UI: success

  note over BA,TA: Branch/Tenant admins can audit/override per RBAC rules
```

---

## Exporting the Illustration

- VS Code: open this file and use **Markdown Preview**. If you have Mermaid support enabled, diagrams render automatically.
- If you want PNG/SVG export, use `@mermaid-js/mermaid-cli` (mmdc) or an online Mermaid renderer.
