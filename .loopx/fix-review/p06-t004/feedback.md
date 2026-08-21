# Child 06 T-004 Review Feedback

Origin: `.loopx/subagent-exec/reviews/06-T-004/review-artifact.json`, attempt 1.

| ID     | Severity  | Source                 | Finding                                                                                                                  | Basis                                                                           | Decision                                                                                                                                                                                         | Evidence                                                                                                                                                              | Verification                                                                                                                                         | Re-review                                                                                               | Status                                     |
| ------ | --------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| FR-001 | Important | review attempt 1 F-001 | Artifact inspection checks RSSHub only beside `app.asar`, so an embedded `app.asar/resources/rsshub` runtime would pass. | AC-9, D-011, TC-7; real staged/package tree must contain no `resources/rsshub`. | accepted_fixed; reuse the existing `listPackage` entry set, detect exact `resources/rsshub` root/descendants inside `app.asar`, and return only sanitized `resources/app.asar:*` evidence paths. | `package-artifact.ts` merges sanitized asar hits into `rsshubPaths`; fake archive injection asserts `resources/app.asar:resources/rsshub/dist/server.js` is rejected. | Focused suite 12/12; focused tsc/prettier/diff pass; real inspection has zero hits and 23/23 resources; independent app.asar assertion reports zero. | attempt 2 pass, canonical `SPEC_COMPLIANT`                                                              | closed                                     |
| FR-002 | Important | review attempt 1 F-002 | RSSHub ignore regex matches nested `*/resources/rsshub` paths rather than only root `/resources/rsshub` and descendants. | AC-9, D-011, TC-7; exclusion must be narrow and preserve near misses.           | accepted_fixed; normalize separators first and anchor the shared predicate to `^/resources/rsshub(?:/                                                                                            | $)`.                                                                                                                                                                  | Shared pattern is now root-anchored; POSIX and Windows-normalized nested `resources/rsshub` near misses remain included.                             | Focused suite 12/12 and packaging regression pass; Forge continues consuming the single shared pattern. | attempt 2 pass, canonical `SPEC_COMPLIANT` | closed |

## Lancet Decisions

- FR-001 reuses the existing asar entry listing; no second archive scan abstraction or dependency.
- FR-002 changes only the shared root predicate consumed by Forge and tests; no broader `resources` exclusion.
- No source RSSHub directory deletion, packaging redesign, user-file edit, staging, or commit.

## Verification Snapshot

- `pnpm --dir apps/desktop performance:package-artifact:test`: 12/12 pass.
- Focused TypeScript command: pass.
- Focused Prettier plus `git diff --check`: pass.
- Real current Forge artifact inspection: `rsshubPaths=[]`, required paths 23/23 true.
- Manual app.asar entry assertion: `resources/rsshub` root/descendants = 0.
- app.asar SHA-256: `774d1475c2b903394565f889569641243ca54101ae18e081ae317e900d13cb6c`.
- Inspection JSON SHA-256: `1f07ddc8785fba4381b094f8a7db968af4cbf85d3338c4441322c5d7c6dfa1e1`.
- A full post-fix `pnpm --filter suhui build:electron:unsigned` passed; reinspection remained zero RSSHub and 23/23 required resources. Rebuilt DMG/ZIP hashes are recorded in the T-004 implementer report.
- Schema/config guard lists only pre-existing user-owned `.gitignore` and `.vscode/settings.json`; no schema/migration file.

Both findings are closed by originating re-review attempt 2. Canonical result:
`.loopx/subagent-exec/reviews/06-T-004/review-artifact.json`.
