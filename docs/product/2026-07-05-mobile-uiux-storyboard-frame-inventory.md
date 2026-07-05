---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-05-mobile-uiux-storyboard-package.md
  - docs/product/2026-07-05-mobile-uiux-review-input-package.md
---

# Mobile UI/UX Storyboard Frame Inventory

> Status: **frame inventory only.** This file defines static storyboard frames
> for Step 3 review. It grants no runtime authority.

## Required Frames

| Frame ID | State                    | Must show                                                       | Review question                                                |
| -------- | ------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- |
| `HN-1`   | Help Now default         | Country, verified date, emergency number area, situation list   | Can the user act without reading marketing copy?               |
| `HN-2`   | Country detected         | Detected country, confidence, manual change affordance          | Is the country assumption visible and correctable?             |
| `HN-3`   | Offline                  | Last verified pack, offline limits, emergency-first instruction | Is the offline limit honest without causing panic?             |
| `HN-4`   | Stale pack               | Refresh need, last verified date, blocked/allowed actions       | Is stale content visibly different from verified content?      |
| `HN-5`   | Emergency hotfix         | Updated number, timestamp, source note                          | Would a reviewer catch a wrong-number hotfix before exposure?  |
| `HN-6`   | Dark country placeholder | Unavailable country copy and no broken-looking empty state      | Does this read as intentionally not launched yet?              |
| `IG-1`   | Car accident             | Triage steps, evidence prompts, police/medical boundary         | Are steps short enough for roadside use?                       |
| `IG-2`   | Medical or injury        | Emergency-first posture and non-diagnostic language             | Does anything imply medical advice?                            |
| `IG-3`   | Property/home            | Safety, photo evidence, document checklist                      | Does it avoid false urgency?                                   |
| `IG-4`   | Flight disruption        | Timing, evidence capture, airline boundary                      | Are deadlines and evidence prompts visible?                    |
| `IG-5`   | Permission denied        | Manual fallback and permission recovery                         | Can the user continue without changing settings immediately?   |
| `EC-1`   | Camera allowed           | Capture instruction, local-save note, privacy copy              | Does the user know where evidence goes?                        |
| `EC-2`   | Camera denied            | Manual upload/notes fallback                                    | Can the user continue without granting camera access?          |
| `EC-3`   | Low light                | Quality warning and recapture guidance                          | Is weak evidence clearly marked without shaming the user?      |
| `EC-4`   | Saved locally            | Local-only state, sync limits, delete path                      | Is local custody understandable?                               |
| `EC-5`   | Delete confirmation      | Consequence, cancel, confirm                                    | Is destructive action unmistakable?                            |
| `TM-1`   | Download ready           | Country pack, size, verified date                               | Is the value clear without sounding like a subscription pitch? |
| `TM-2`   | Downloading              | Progress, cancel, network/storage status                        | Does progress avoid false readiness?                           |
| `TM-3`   | Road-ready verified      | Pack hash/version, offline availability                         | Does readiness feel proven rather than decorative?             |
| `TM-4`   | Pack stale               | Refresh requirement and unsafe-content boundary                 | Does the design refuse stale guidance when needed?             |
| `TM-5`   | Storage unavailable      | What cannot download and how to recover                         | Is the failure actionable?                                     |
| `TM-6`   | Integrity failure        | Blocked use, retry, support path                                | Does the design refuse unsafe guidance clearly?                |
| `CP-1`   | Claim Pack read-back     | Basis, summary, human-review boundary                           | Does preliminary output avoid looking legally final?           |
| `CP-2`   | Deadlines                | Dates, source lines, confidence                                 | Are timing risks impossible to miss?                           |
| `CP-3`   | Documents needed         | Required/optional evidence and missing items                    | Can the user see what to gather next?                          |
| `CP-4`   | Free pack fork           | User keeps package without paid handling                        | Is the unpaid path equally dignified?                          |
| `CP-5`   | Handle-it fork           | Paid handling offer, no emergency-context sales pressure        | Is the sales prompt limited to the approved moment?            |
| `FM-1`   | Three recovery amounts   | Low/base/high recovery and member net amount                    | Is user outcome more prominent than platform fee?              |
| `FM-2`   | Zero recovery            | No recovery, no success fee, any third-party cost caveat        | Is the loss outcome honest before signature?                   |
| `FM-3`   | Member discount          | Discounted fee and user receives amount                         | Is the discount useful without hiding the fee base?            |
| `FM-4A`  | Memo 1 option A          | Interdomestik absorbs approved expert/court costs on loss       | Does "recover nothing, pay nothing" remain visibly qualified?  |
| `FM-4B`  | Memo 1 option B          | Success fee waived, approved third-party costs member-payable   | Is the member's possible loss-side cost impossible to miss?    |
| `FM-4C`  | Memo 1 option C          | Cap, above-cap approval, at-risk amount                         | Does the cap appear before signature, not after?               |
| `HM-1A`  | Memo 2 option A          | Named handler from launch                                       | Does the layout support stable handover and absence states?    |
| `HM-1B`  | Memo 2 option B          | Case team from launch                                           | Does no surface imply one stable named person?                 |
| `HM-1C`  | Memo 2 option C          | Case team now, branch-earned named-handler later                | Are branch thresholds copy-ready before runtime?               |
| `AC-1`   | Service agreement        | Service, fee, handler model, document list                      | Can the member understand the commitment before signing?       |
| `AC-2`   | POA/e-sign action        | Signature action, legal copy, disabled/loading states           | Is the signature action visually dominant but not coercive?    |
| `AC-3`   | Signature error          | Retry, support, no duplicate-submit confusion                   | Can the user recover without wondering whether they signed?    |
| `AC-4`   | 135% dynamic type        | Fee, signature, deadline, emergency/help hierarchy              | Does the critical hierarchy survive large text?                |
| `PDF-1`  | Claim Pack PDF           | Reference, source lines, document checklist                     | Would a professional forward or file it?                       |
| `PDF-2`  | Signed pack PDF          | Signature evidence, policy versions, exhibit manifest           | Is audit evidence clear enough without internal jargon?        |
| `PDF-3`  | Sponsor aggregate report | Aggregate-only metrics, no case/member detail                   | Does the design reinforce that sponsor case access is blocked? |
