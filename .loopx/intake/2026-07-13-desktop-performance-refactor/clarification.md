# Suhui Performance Refactor Clarification

## Source Request

- Initial problem: the project feels slow, especially during page loading.
- Follow-up request: "你正对这些点做一下重构计划吧"

## Confirmed Answers

### Round 1: Database boundary

Question: Should the performance refactor remain behavior-preserving and leave database,
authentication, and other architecture changes to separate design work?

User answer: "嗯，不动数据库层面的设计"

Confirmed interpretation:

- Keep PostgreSQL as the runtime database.
- Do not redesign storage ownership, schema, database configuration precedence, or data migration.
- Application-level query projection, pagination, batching, and IPC boundaries remain in scope as
  long as externally observable behavior and persistent schema remain compatible.

### Round 2: Performance fixture scale

Question: What fixture scale should represent normal and stress usage?

User answer: "常规订阅400个吧，1 万篇文章，压力 800 个订阅 / 10 万篇文章”"

Confirmed interpretation:

- Normal fixture: 400 subscriptions and 10,000 entries.
- Stress fixture: 800 subscriptions and 100,000 entries.
- Performance regressions must be checked against both fixtures.

### Round 3: Quantitative performance targets

Question: Should the refactor use the proposed P95 targets for Desktop and remote performance?

User answer: "嗯"

Confirmed interpretation:

- Desktop shell readiness P95 must be at most 1.2 seconds.
- After the database is usable, Desktop interactive readiness must add at most 500 milliseconds at
  P95.
- Feed and unread-view switching must produce a usable list within 300 milliseconds at P95.
- Remote shell first visibility must be at most 800 milliseconds at P95.
- Remote data readiness must be at most 1.5 seconds at P95.

### Round 4: Desktop and remote scope

Question: Should Desktop be the only scope, or should the hosted remote browser experience be part
of the same performance initiative?

User answer: "我觉得都需要优化，这是一个内容，都纳入本计划吧"

Confirmed interpretation:

- Desktop and the hosted remote browser are both in scope.
- They belong to one performance initiative and one overall execution plan.
- The plan may sequence shared query work, Desktop work, and remote work as separate checkpoints,
  but must verify the combined result as one feature.
- Remote early shell/loading/error rendering is an intentional user-visible behavior improvement and
  therefore requires a design-spec handoff before implementation planning.

### Round 5: Packaging and dependency-cleanup scope

Question: Should the initiative include startup- and artifact-related cleanup while excluding a broad
unused-dependency sweep?

User answer: "嗯，可以"

Confirmed interpretation:

- Include dependency splitting or removal when it directly reduces the initial runtime graph.
- Include a packaging guard that excludes the removed embedded RSSHub runtime directory.
- Exclude broad repository-wide dependency cleanup that has no measured startup or artifact impact.

## Brownfield Evidence

- Desktop entry loading fetches unbounded full rows before renderer-side filtering and slicing.
- Critical startup hydration loads all visible entries sequentially.
- Batch refresh broadcasts cumulative results, causing repeated renderer refetches.
- Production renderer startup loads a large eager dependency graph.
- Remote rendering waits for all initial hydration requests before mounting React.

## Rejected Or Deferred Alternatives

- PostgreSQL to SQLite migration: deferred; explicitly outside the confirmed scope.
- Electron/React to Tauri or another UI stack: rejected for this refactor because it does not address
  the measured data-flow bottlenecks.
- Remote authentication redesign: deferred because it changes permissions and is not required for
  the performance refactor.

## Pending Questions

None.

## Resume State

- current_round: complete
- ambiguity_score: low
- unresolved_count: 0
- non_goals_resolved: true
- decision_boundaries_resolved: true
- pressure_pass_complete: true
- next_question: none; hand off to `spec`.
