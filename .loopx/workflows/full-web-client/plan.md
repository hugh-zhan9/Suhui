---
slug: full-web-client
source_requirements: .loopx/specs/clarify-full-web-client-20260507224057.md
context_snapshot: .loopx/context/full-web-client-20260507224917.md
plan_current_iteration: 1
plan_consensus_mode: true
plan_deliberate_mode: false
plan_architect_review_status: complete
plan_critic_verdict: approve
plan_package_status: complete
acceptance_criteria_testable: true
verification_steps_resolved: true
execution_inputs_resolved: true
execution_approved: false
---

# Plan: Full Web Client

## RALPLAN-DR Summary

### Principles

1. Electron main remains the authority: Web and Desktop are clients, not competing data owners.
2. Application services are the shared business boundary: IPC and HTTP delegate to the same service operations.
3. No first-version auth or permission checks: preserve the clarified no-auth LAN/VPN model.
4. Migrate by parity slices: each service/API/runtime slice must be independently testable before UI migration depends on it.
5. Keep legacy remote entry until replacement is verified; do not delete it without explicit approval.

### Decision Drivers

1. Prevent business drift between Desktop IPC and Web HTTP behavior.
2. Deliver a complete first-version Web scope without creating a separate server product.
3. Reduce risk from current direct `window.electron`, IPC, and `/api/*` branches scattered through store and renderer code.

### Viable Options

**Option A: Extend the current lightweight `remote-app.tsx`**

- Pros: lowest UI disruption; fastest to add visible controls.
- Cons: duplicates desktop workflows, does not solve IPC/HTTP divergence, risks becoming a second product surface.

**Option B: Service-first migration, then full Web runtime entry**

- Pros: fixes core architecture, lets Desktop and Web share behavior, supports full feature scope, keeps old remote available during migration.
- Cons: larger upfront service and adapter work; requires careful incremental verification.

**Option C: Revive standalone SSR/Web app**

- Pros: traditional Web product shape.
- Cons: violates clarify scope; adds independent server/deployment model; risks replacing Electron main as authority.

### Decision

Choose **Option B**.

The plan expands `apps/desktop/layer/main/src/application/*`, routes IPC and HTTP through those services, introduces runtime service clients for renderer/store code, and only then migrates the remote browser entry toward the full app UI.

## ADR

### Decision

Adopt an in-desktop, Electron-main-hosted full Web endpoint with shared application services and IPC/HTTP adapters.

### Drivers

- Current repo is desktop-only.
- Current remote endpoint is partial.
- User explicitly wants `apps/desktop/layer/main/src/application/*` expanded, not a new `apps/server`.
- First version includes broad write-capable surface: reading, subscriptions, batch management, refresh, read/unread, settings, import/export, RSSHub config, PDF export.

### Alternatives Considered

- Keep extending lightweight remote UI: rejected as insufficient architecture.
- New top-level Web/server product: rejected by clarify scope.
- Raw SQL-over-HTTP proxy: rejected because it exposes persistence details and bypasses application service intent.

### Why Chosen

Shared application services give the strongest consistency model while respecting the current local-first Desktop architecture.

### Consequences

- IPC services must shrink toward adapters.
- Remote HTTP server must be refactored beyond the current single-file route handler.
- Renderer/store modules need runtime clients instead of direct environment branching.
- First implementation will be multi-phase and should not be attempted as one broad patch.

### Follow-Ups

- Reassess authentication after the first no-auth version exists.
- Consider splitting application services into a package only if reuse pressure justifies it; this plan does not authorize a new top-level package.

## Requirements Translation

### Must Have

- Full browser endpoint served by the running Desktop app.
- Shared Electron-main application services used by both IPC and HTTP.
- Web workflows for reading, subscriptions, batch subscription management, refresh, read/unread, settings, import/export, RSSHub configuration, and PDF export.
- SSE/status behavior that clearly reports connection loss.

### Must Not Have

- Independent `apps/server`.
- Authentication, access code, permissions, or read-only mode.
- Change away from local Postgres as source of truth.
- First-version support for tray/window/system integrations listed in clarify non-goals.

## Execution Inputs

Concrete sources before build starts:

- Requirements: `.loopx/specs/clarify-full-web-client-20260507224057.md`
- Context snapshot: `.loopx/context/full-web-client-20260507224917.md`
- Existing service base: `apps/desktop/layer/main/src/application/*`
- IPC extraction sources: `apps/desktop/layer/main/src/ipc/services/db.ts`, `setting.ts`, `sync.ts`, `app.ts`, `discover.ts`, `reader.ts`
- HTTP adapter source: `apps/desktop/layer/main/src/remote/manager.ts`
- Remote client source: `apps/desktop/layer/renderer/src/remote/*`
- Runtime branching sources: `packages/internal/store/src/modules/*/store.ts`, `packages/internal/store/src/remote/*`, `apps/desktop/layer/renderer/src/lib/client.ts`, `main.tsx`, `App.tsx`, `router.tsx`
- Existing verification examples: `apps/desktop/layer/main/src/remote/manager.test.ts`, `application/*.test.ts`, `ipc/services/*.test.ts`

## Development Plan Overview

1. Service inventory and contracts
2. Extract application services from IPC
3. Refactor IPC into adapters
4. Expand HTTP routes and SSE events
5. Introduce renderer/store runtime service clients
6. Migrate Web endpoint toward full UI
7. Complete feature parity workflows and verification

Detailed steps are in `development-plan.md`.

## Acceptance Criteria

- `DbService` no longer owns primary business logic for add/preview/refresh/delete subscription behavior; those operations are available through application services and called by IPC.
- Remote HTTP routes expose the first-version feature set through application services.
- Desktop IPC and HTTP routes share behavior for corresponding operations.
- Web runtime can perform all in-scope workflows without `window.electron`.
- Existing Desktop reading/subscription/refresh behavior still passes tests.
- Remote Web disconnection is visible and does not pretend writes succeeded.
- PDF export works from Web without a native save dialog requirement.
- No auth is introduced.

## Risk Register

| Risk                                                    | Impact | Mitigation                                                                                 |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| Service extraction changes Desktop behavior             | High   | Extract with IPC compatibility tests before changing UI                                    |
| Full UI depends on Electron-only affordances            | High   | Introduce runtime client interfaces and feature gates before switching remote entry        |
| HTTP route surface grows unstructured                   | Medium | Split remote API route modules by domain and use typed payload helpers                     |
| PDF export differs between Desktop and Web              | Medium | Define Web PDF as HTTP download/stream; keep Desktop dialog behavior                       |
| No-auth write surface is dangerous                      | High   | Preserve clarified requirement; document status/connection clearly; do not add hidden auth |
| Batch operations and refresh events desync client state | Medium | Expand SSE event taxonomy and invalidate/refetch tests                                     |

## Planner Revision Notes

Initial draft risk: switching the remote entry to the full UI too early would couple UI migration to incomplete service extraction. Revised plan gates full UI migration behind service/adapter parity and keeps legacy remote available until verified.

## Architect Review

### Strongest Steelman Objection

The plan may underestimate how much of the desktop main renderer assumes Electron-only APIs. Reusing the full UI could pull in window controls, native menus, system dialogs, direct IPC, and desktop-only settings despite the non-goals.

### Tradeoff Tension

Using the full UI maximizes feature parity, but isolating a Web-safe runtime requires more adapter work than extending the current lightweight remote UI.

### Risks And Mitigations

- Risk: renderer imports `ipcServices` at module load and remote runtime crashes before feature gates apply.
  - Mitigation: introduce runtime-safe clients and no-op/Web implementations before routing remote to full UI.
- Risk: application services remain thin wrappers around IPC services.
  - Mitigation: extraction phase explicitly makes IPC services adapters, and tests assert service behavior without IPC context.
- Risk: full UI settings pages expose non-goals.
  - Mitigation: Web runtime capability manifest hides unsupported desktop/system sections.

### Architect Recommendation

Approve with the revision that the full Web UI switch is late-phase and gated by runtime compatibility tests.

## Critic Gate

Verdict: `APPROVE`

Checks:

- Principle-option consistency: pass.
- Alternatives fairly compared: pass.
- Risk mitigation clear: pass.
- Acceptance criteria testable: pass.
- Verification steps concrete: pass, see `test-plan.md`.
- Execution inputs mapped: pass.
- Non-goals and decision boundaries preserved: pass.

Residual warning: the plan is broad. Execution should be split into build slices and should not attempt all UI parity in a single change.

## Available Execution Lanes

- Recommended: `$build --direct .loopx/workflows/full-web-client/development-plan.md`
- Alternative: `$autopilot --direct .loopx/workflows/full-web-client/plan.md` only if the user wants a longer autonomous run and accepts multi-slice execution.

Execution is not approved by this plan command.
