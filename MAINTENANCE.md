# Maintenance Guide

This document explains how to maintain the CSSOM parser repository, including updating specifications, web platform tests, and generating fixtures.

## Workflow

The maintenance workflow typically involves:

1.  **Update Submodules & Dependencies**: Pull the latest changes from the W3C CSSWG drafts and Web Platform Tests (`submodules/`), and update dependencies.
2.  **Run Codegen & Generate Fixtures**: Extract spec data and test fixtures from updated submodules.
3.  **Audit & Revise Feasibility Manifest**: Re-evaluate browser-dependent exclusions against the feasibility criteria.
4.  **Run Tests & Snapshot Baseline**: Verify unit tests and snapshot the passing WPT subtest baseline (`pnpm run wpt:baseline`) to guard against test-level regressions.
5.  **Sync Progress**: Update WPT conformance progress tables in `README.md` and `wpt-progress.md`.

### Convenient Commands

We provide npm scripts to make this process straightforward.

#### Run Full Maintenance

To run all steps (update submodules, generate fixtures, and run tests) in one go:

```bash
pnpm run maintain
```

#### Individual Steps

If you want to run the steps individually:

**1. Update Submodules:**
```bash
pnpm run submodules:upgrade
```
This runs `git submodule update --init --remote && pnpm run submodules:update` to pull remote updates and recursively initialize.

**2. Run Full Codegen:**
```bash
pnpm run codegen
```
Generates CSS properties, syntax dictionaries, SVG presentation attributes, normative HTML User-Agent stylesheet (`src/data/gen/ua-stylesheet.ts`), colors, and unit definitions from the updated specs.

**3. Generate Fixtures:**
```bash
pnpm run fixtures:generate
```
This runs `node scripts/external_suites/extract_all.ts`.

**4. Triage Feasibility, Parity & Failure Clusters:**
When WPT test files are added, modified, or removed in `submodules/web-platform-tests/`, inspect failure clusters and 3-way differential parity against Chrome reference runs per [`scripts/wpt/node/README.md`](./scripts/wpt/node/README.md) and [`.agents/skills/parity/SKILL.md`](./.agents/skills/parity/SKILL.md).

```bash
# Cluster cached failures across all active suites (or single spec with --spec=<name>)
pnpm run wpt:cluster

# Or run live execution to cluster immediately without needing a prior run
pnpm run wpt:cluster --live --spec=cssom

# Compare 3-way differential parity against Reference Chrome (wpt.fyi)
pnpm run wpt parity --spec=cssom

# Run full WPT test suite
pnpm run wpt:run
```

**5. Run Tests, Update Baseline & Sync Progress:**
```bash
# Run preflight unit tests and linter
pnpm run preflight

# Snapshot the passing subtest baseline (updates tests/fixtures/baselines/wpt-passing-set-baseline.json)
pnpm run wpt:baseline

# Update WPT conformance progress table and README.md summary
pnpm run wpt:progress
```

## Spec Compliance Maintenance

When specifications are updated in the submodules, we need to ensure our implementation remains compliant and that the reference comments in the code are up to date.

### Process for an Agent:
1.  **Diff Specs**: Run `git diff` on the `submodules/csswg-drafts` directory to see what changed in the relevant specs (e.g., `css-syntax-3`, `css-nesting-1`, `cssom-1`) since the last update.
2.  **Update Comments**: If section numbers or anchors changed, update the comments in `src/tokenizer.ts` and `src/parser.ts` to reflect the new spec locations.
3.  **Implement Changes**: If the spec introduced new parsing rules or modified existing ones, update the implementation accordingly.
4.  **Verify**: Run tests to ensure no regressions.

## WPT Submodule Upgrades & Feasibility Auditing

When `submodules/web-platform-tests/` or dependencies are upgraded:

1.  **Anti-Greenwashing Invariant**: Never exclude tests merely because they fail or require complex AST handling. Tests are excluded in `tests/wpt-node-config.json` *only* for runner blockers (reftests, VM loader crashes, indefinite timeouts).
2.  **Cluster Triage & Feasibility Classification**: Run the failure clustering tool and audit any new failure patterns per [`scripts/wpt/node/README.md`](./scripts/wpt/node/README.md):
    ```bash
    # 1. Cluster current failures
    pnpm run wpt:cluster

    # 2. Verify and test classifier rules
    pnpm test:node
    ```
3.  **Refresh Passing Subtest Baseline**: Run `pnpm run wpt:baseline` to update [`tests/fixtures/baselines/wpt-passing-set-baseline.json`](tests/fixtures/baselines/wpt-passing-set-baseline.json). This records the full passing subtest set so regressions can be detected on specific tests via `pnpm run wpt:verify`.
4.  **Synchronize Progress**: Run `pnpm run wpt:progress` to update the historical conformance progress log and `README.md`.

## Spec Compliance Auditing via Subagents

To maintain high compliance at scale, we use specialized AI subagents (such as `scrutineer`) to audit the codebase against the specifications. This process should be run periodically or when significant spec updates occur.

### Recommended Subagents

When initiating an audit, spawn the following subagents with their specific roles and prompts:

#### 1. Core Spec Auditors
- **CSSOM Spec Auditor**: Reads `cssom-1/Overview.bs` and compares with `src/types.ts` and `src/CSSOM.ts`. Focuses on rule interfaces and inheritance.
- **CSS Syntax Spec Auditor**: Reads `css-syntax-3/Overview.bs` and compares with `src/tokenizer.ts` and `src/parser.ts`. Focuses on low-level tokenization and parsing algorithms.
- **CSS Nesting & Variables Auditor**: Reads `css-nesting-1/Overview.bs` and `css-variables-1/Overview.bs`. Focuses on interleaved declarations and custom property handling.
- **Media Queries Auditor**: Reads `mediaqueries-4/Overview.bs`. Focuses on media query list parsing and evaluation.
- **CSS Logical Auditor**: Reads `css-logical-1/Overview.bs`. Focuses on logical properties shorthand serialization in `cssText`.
- **CSS Values & Typed OM Auditor**: Reads `css-values-4/Overview.bs` and `submodules/css-houdini-drafts/css-typed-om/Overview.bs`. Focuses on value representation and serialization.

#### 2. Edge Case Researchers
- **CSS Spec Tricky Case Researcher**: Reads specs to identify complex error recovery scenarios or easily overlooked rules (e.g., EOF handling, unclosed constructs).
- **WPT Tricky Case Researcher**: Searches through `submodules/web-platform-tests` to find specific tests that cover edge cases that might fail in naive implementations.

### General Task for Auditors
Every auditor should:
1.  **Read the relevant spec** in the submodule.
2.  **Compare with the current implementation** in the corresponding file.
3.  **Identify non-compliance**, missing features, or technical debt.
4.  **Report findings** with specific spec references and actionable recommendations.

## Fixture Generation Details

The `scripts/external_suites/extract_wpt.ts` script reads from the submodules and generates JSON fixtures used by the tests. If you add new test files to WPT or need to support new properties, you may need to update this script or run it to include the new data.

*Note: We rely on Node's ability to run `.ts` files directly (supported in Node 24.11.0+), so no build step is needed for scripts.*
