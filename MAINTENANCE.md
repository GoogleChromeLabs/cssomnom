# Maintenance Guide

This document explains how to maintain the CSSOM parser repository, including updating specifications, web platform tests, and generating fixtures.

## Workflow

The maintenance workflow typically involves three steps:

1.  **Update Submodules**: Pull the latest changes from the W3C CSSWG drafts and Web Platform Tests.
2.  **Generate Fixtures**: Extract test cases from the updated WPT files.
3.  **Run Tests**: Verify that the parser still works and passes the tests.

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

**2. Generate Fixtures:**
```bash
pnpm run fixtures:generate
```
This runs `node scripts/external_suites/extract_all.ts`.

**3. Run Tests:**
```bash
pnpm test
```
Or run the full preflight check (typecheck, linter, and tests):
```bash
pnpm run preflight
```

## Spec Compliance Maintenance

When specifications are updated in the submodules, we need to ensure our implementation remains compliant and that the reference comments in the code are up to date.

### Process for an Agent:
1.  **Diff Specs**: Run `git diff` on the `submodules/csswg-drafts` directory to see what changed in the relevant specs (e.g., `css-syntax-3`, `css-nesting-1`, `cssom-1`) since the last update.
2.  **Update Comments**: If section numbers or anchors changed, update the comments in `src/tokenizer.ts` and `src/parser.ts` to reflect the new spec locations.
3.  **Implement Changes**: If the spec introduced new parsing rules or modified existing ones, update the implementation accordingly.
4.  **Verify**: Run tests to ensure no regressions.

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
