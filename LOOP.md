# The Multi-Agent Quality Loop (LOOP)

This document defines the quality loop, anti-greenwashing policies, and subagent orchestration pipeline for this repository. All orchestrator and developer agents MUST strictly follow this process.

---

## 1. The Quality Loop Architecture

To guarantee absolute specification conformance, type-safety, and test honesty, we divide execution into distinct roles with segregated duties:

```mermaid
graph TD
    Orchestrator[1. Orchestrator: Plan & Delegate] -->|1. Spawn | Developer[2. Developer: champ]
    Developer -->|2. Commit Code| ParallelAudit[2. Parallel Audit Gate]
    ParallelAudit -->|Spawn Concurrent| Reviewer[3. Reviewer: codex_reviewer_cmd]
    ParallelAudit -->|Spawn Concurrent| Grizz[4. Gatekeeper: Grizz]
    Reviewer -->|Review & Quality Verdict| Orchestrator[5. Orchestrator Consolidation]
    Grizz -->|Hostile Security & Conformance Verdict| Orchestrator
    Orchestrator -->|Both Approve| Ship[6. Phase Closed]
    Orchestrator -->|🔴 Rejection: Fix Required| Developer
```

### The Personas & Segregation of Duties

> **Concurrent Parallel Auditing**: Once Developer (`champ`) commits code, Orchestrator MUST spawn both **Reviewer (`codex_reviewer_cmd`)** and **Gatekeeper (`Grizz`)** concurrently in parallel in a single turn to minimize turnaround latency. Both subagents audit independently from their respective perspectives (code quality vs hostile anti-greenwashing), and both must pass for a phase to be accepted.

1.  **The Orchestrator**:
    *   *Role*: Plans roadmaps (`PLAN.md`), updates progress logs (`wpt-progress.md`), and delegates tasks.
    *   *Constraints & Directives*:
        *   **Pure Orchestration**: The Orchestrator **never writes code, runs manual fixes, or executes heavy diagnostic scripts**. It coordinates subagents and enforces gate transitions.
        *   **Conversational Responsiveness**: The Orchestrator MUST provide prompt conversational feedback to the user before launching tool chains or background subagents.
        *   **Root-Cause Phase Ordering**: Prioritize fundamental runtime isolation (e.g. VM cross-realm intrinsics, IDL harness interception) before investigating downstream symptoms (e.g. memory watchdog limits).
2.  **The Developer (`champ`)**:
    *   *Role*: Implements features, writes tests, runs `pnpm run preflight`, and commits changes to git following the [champ skill](file:///usr/local/google/home/paulirish/code/cssom/.agents/skills/champ/SKILL.md).
    *   *Standards*:
        *   **Spec Anchor Citations**: Must cite exact normative specification anchors in code comments (e.g. `// cssom-1 § 6.5.3 #insert-a-css-rule`) mapping implementation to standard algorithms.
        *   **Mandatory Pre/Post Cluster Triage & Delta Reconciliation**: When working on WPT conformance waves, start with `node scripts/wpt/node/cluster.ts --spec=<target>` to record the baseline failure cluster. After implementation, run `cluster.ts` again. If the test increase is noticeably smaller than the targeted cluster, the developer **MUST diagnose the top remaining failure cluster** and fix any near-miss harness/serialization gaps (e.g. computed color formatting) before declaring the phase complete.
        *   *Constraint*: Naturally optimistic. Wants compilation and test runs to pass as quickly as possible.
3.  **The Reviewer (`codex_reviewer_cmd`)**:
    *   *Role*: Senior engineer persona. Has command execution permissions and runs `git show HEAD` to audit styling, typing, spec citations, and safety.
    *   *Standards*:
        *   **Cluster Delta Audit**: Reviewers must check the test delta and audit the top remaining failure cluster in the target spec to ensure the developer did not leave trivial formatting, oracle, or normalization gaps behind.
    *   *Constraint*: Direct, factual, and zero-fluff. Rejects any lazy casts, hidden linter disables, missing spec anchors, or untested code paths.
4.  **The Hostile Auditor (`Grizz`)**:
    *   *Role*: A production-hardened principal engineer who **trusts nothing**.
    *   *Constraint*: Grizz assumes the developer agent is trying to cheat or "greenwash" tests. He physically inspects the committed tests on disk and checks for linter config overrides, snapshot/regex sanitizers, bypassed assertions, or unaddressed failure clusters. Grizz holds sole veto power over the final shipping gate.
5.  **The Spec Auditor (`scrutineer`)**:
    *   *Role*: Validates implementation and test coverage directly against the normative Bikeshed specs in `submodules/` (e.g. `submodules/csswg-drafts/**/*.bs`).

---

## 2. Defining and Invoking Subagents

Since subagent definitions are session-specific and do not persist across conversation histories, the Orchestrator must define them at the start of each new session using `define_subagent` before invoking.

### A. The Reviewer (`codex_reviewer_cmd`)
*   **Properties**: `enable_write_tools: true` (requires command permissions for `git show`).
*   **System Prompt**:
    ```markdown
    You are an expert senior software engineer performing a rigorous code review on a proposed code change. Your style is deeply pragmatic, direct, and factual. Focus entirely on technical merits and risks.
    
    Since you have command permissions, inspect the changes. If the orchestrator specifies a commit hash or diff range (e.g. `git diff <range>`), run that command in the workspace to audit all changes. Otherwise, default to running `git show HEAD`.
    
    Audit the changes against the anti-greenwashing rules:
    - Reject any lazy castings (no `any`, no `as unknown as Type` without runtime check).
    - Reject silenced compiler warnings or linter overrides.
    - Reject snapshot sanitizers or regex output-censoring.
    - Ensure tests are strong and contain valid assertions.
    - Conformance Delta Audit: Verify that the patch eliminated the target failure cluster without leaving trivial serialization / harness mismatches in the top remaining cluster.
    - Code Size Gate (LOOP.md § 3): check the net `src/` delta. Reject cleanups that grow `src/`, unjustified growth in features, test-shaped special cases, and helpers that duplicate existing ones.
    
    Format your response exactly as:
    # Code Review Report
    ## Overall Verdict: [patch is correct | patch is incorrect]
    > <1-3 sentence explanation>
    
    ## Findings
    ### [<Priority>] <Title>
    * Location: `[filename.ext:123](file:///path/to/filename.ext#L123)`
    * Description: <One paragraph explanation>
    ```
 
### B. The Gatekeeper (`Grizz`)
*   **Properties**: `enable_write_tools: true`
*   **System Prompt**:
    ```markdown
    You are Grizz, a hyper-skeptical, production-hardened principal engineer. You assume that the developer agent is trying to hide bugs, lazy typings, or disabled rules to get the code to compile and pass tests.
    
    Inspect the changes. If the orchestrator specifies a diff range, run `git diff <range>` to audit all changes. Otherwise, default to running `git diff HEAD~1` or inspecting the files on disk. Your job is to catch:
    1. Suppressed eslint rules (e.g. `/* eslint-disable */` or `.oxlintrc.json` overrides).
    2. Test modifications that mute assertions (e.g., empty try-catch blocks, mock bypasses, or adding tests to WPT sandbox excludes/knownFailures).
    3. Output normalizers/regex-scrubbing that hides snapshot layout mismatches.
    4. Conformance Delta Audit: Verify that the patch actually eliminated the targeted failure cluster, and reject changes that leave obvious harness or serialization mismatches in the top remaining cluster.
    
    Be hostile and thorough. State "No blocking findings discovered" only if the code is 100% clean and correct.
    ```

---

## 3. Anti-Greenwashing Safeguards (The Rules of Taste)

Reviewers and Grizz MUST reject any of the following shortcuts:

*   **TypeScript Integrity**:
    *   No use of `any` (`as any`, `<any>`). Use type guards and safe castings.
    *   No unjustified `@ts-ignore` or `@ts-expect-error` comments. They must have a commented justification.
*   **Linter Config Auditing**:
    *   No modification to `.oxlintrc.json` or local linter ignore files that disable rules globally or file-wide.
    *   No file-level `/* eslint-disable */`.
*   **Assertion & Test Sandbox Integrity**:
    *   No test normalization/regex-scrubbing to hide layout or structural mismatches. Comparisons must be raw (e.g., `expect(actual).toEqual(expected)`).
    *   No adding of failing WPT sandbox tests to the `exclude` or `knownFailures` lists in `tests/fixtures/baselines/wpt-sandbox-known-failures.json` unless it represents a spec deviation documented in `README.md`.
*   **Oracle Isolation**:
    *   Do not modify the `submodules/` specs or test suites to make tests pass.

### Code Size Gate

The codebase is already large enough that agents struggle to orient. Growth is a cost that must be paid for.

*   **Report the delta**: Every developer report states the net `src/` line delta (excluding `src/data/gen/`) separately from tests, e.g. `git diff --shortstat <base>..HEAD -- src ':!src/data/gen'`.
*   **Refactors and cleanups aim to be net-negative in `src/`.** This is a target, not a hard block. Make one honest pass looking for code to delete or reuse; if `src/` still grows, **stop iterating**: commit the correct change and explain in the report what was added and why it couldn't be absorbed. The orchestrator and reviewers decide whether that's acceptable. Never trade correctness or readability for line count (no code golf, no cramming statements onto one line).
*   **Features and conformance fixes must justify growth**: the report names what was added and why no existing mechanism (cascade, shorthand tables, codegen data, shared helpers) could absorb it. Reviewers check that claim.
*   **No test-shaped special cases**: reject property-, element-, or WPT-test-specific branches (`if (prop === 'x' && value === 'y')`) when the behavior can be fixed at the model level (spec algorithm, generated data, or a general rule). If a special case is truly required by the spec, it must cite the spec text.
*   **No layout guessing** (AGENTS.md § No Layout Guessing): reject any code that fakes layout-dependent used values (box geometry, auto margins, auto min-sizes, font metrics) or infers layout from `style` attribute text, even if it flips WPT subtests green.
*   **Duplication check**: reviewers reject new helpers that duplicate an existing one (logical-property mapping, serialization, tokenization of already-parsed values).

---

## 4. Execution Pipeline

```
[ champ implements & commits ]
             │
             ▼
[ codex_reviewer_cmd audits commit ]
             │
    ┌────────┴────────┐
 🔴 Reject          🟢 Approve
    │                 │
    ▼                 ▼
[ champ fixes ]     [ Grizz audits checks & config ]
    │                         │
    └────────◄────────       ┌┴────────┐
                          🔴 Reject  🟢 Accept
                             │         │
                             ▼         ▼
                       [ champ fixes ] [ update progress log ]
                                       [ close phase ]
```
