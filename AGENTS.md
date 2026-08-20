## Project Overview
Building a spec-compliant CSSOM (CSS Object Model) parser in pure TypeScript.

### Coding Rules
- **Execution**: Run node scripts directly: `node script.ts`. Do NOT use `npx tsx` or `ts-node`.

## Spec References
We are building a spec-compliant implementation. Agents MUST adhere to the W3C specifications listed below, except where intentional deviations are documented in `README.md` for pragmatism, performance, or Node.js compatibility. You are expected to actively consult these Bikeshed (`.bs`) source files to understand the normative algorithms and edge cases before implementing or auditing features.

Relevant Specifications:
- CSSOM: `submodules/csswg-drafts/cssom-1/Overview.bs`
- CSS Syntax: `submodules/csswg-drafts/css-syntax-3/Overview.bs`
- CSS Values: `submodules/csswg-drafts/css-values-4/Overview.bs`
- CSS Nesting: `submodules/csswg-drafts/css-nesting-1/Overview.bs`
- Selectors: `submodules/csswg-drafts/selectors-4/Overview.bs`
- CSS Typed OM: `submodules/css-houdini-drafts/css-typed-om/Overview.bs`
- CSS Variables: `submodules/csswg-drafts/css-variables-1/Overview.bs`
- CSS Logical: `submodules/csswg-drafts/css-logical-1/Overview.bs`
- Media Queries: `submodules/csswg-drafts/mediaqueries-4/Overview.bs`
- CSS Properties and Values API (Houdini): `submodules/css-houdini-drafts/css-properties-values-api/Overview.bs`
- CSS Typed OM 2 (Houdini): `submodules/css-houdini-drafts/css-typed-om-2/Overview.bs`

### Related Proposals
- [CSS Parser Extensions](https://github.com/bramus/css-parser-extensions): A proposal along similar lines to the CSS Parser API by Bramus.

## Spec Compliance & Testing Guidelines
- **Executable Specification**: When implementing algorithms from the CSS specs, add comments citing the specific spec sections (e.g., `// 5.5.3 Consume a qualified rule` or `cssom-1 #parsing-selectors`) to map code directly to the spec.
- **WPT Fixtures**: Continuously look for and extract new test fixtures and test cases from the W3C Web Platform Tests (WPT) submodule to ensure high conformance.
- **Red/Green TDD**: Prefer test-driven development when fixing bugs or compliance gaps. Write a failing test first to demonstrate the issue (Red), then implement the fix to make it pass (Green). This protects against building tests that pass by accident.
- **Bug Fixes & Regression Tests**: Whenever you fix a bug or a spec non-compliance, you MUST add a corresponding regression test to ensure the bug does not return. Do not simply fix the code without verifying it with a test.
- Citations: Add spec references as comments to our implementation so future users can easily cross-reference the relevant spec text.

## Architectural Constraints

### Circular Dependency Management (`ParseHooks`)
To avoid circular dependencies between the core parser and the CSSOM/Typed OM layers, we use a Dependency Inversion pattern via `src/parse-hooks.ts`.
- **Rule**: Do NOT import `Parser` directly into `src/CSSOM.ts` or `src/typed-om.ts`.
- **Solution**: Use `ParseHooks.parseComponentValues()`, `ParseHooks.consumeRule()`, etc. The implementation is injected into these hooks at the bottom of `src/parser.ts`.

### API Boundaries
We intentionally deviate from some specifications for pragmatism, performance, or Node.js compatibility (e.g., providing synchronous versions of Houdini APIs).
- **Rule**: Before proposing refactors to align strictly with IDL, review `README.md` to understand documented intentional deviations.

### Safe Subprocess Execution & Mechanical Preflight Enforcement (`safe-child-process.ts`)
To prevent unmonitored child process spawning, worker process memory ballooning, swap thrashing, and process hangs, all test execution and worker pooling MUST use the centralized safe execution kernel.
- **Rule**: Direct imports of `node:child_process` or `child_process` in `scripts/` and `tests/` are banned and enforced via `pnpm run check:safe-exec` during preflight.
- **Exceptions**: Only the centralized safe kernel (`scripts/wpt/node/safe-child-process.ts`) and synchronous codegen build scripts (`scripts/codegen/generate_all.ts`, `scripts/external_suites/extract_all.ts`, `scripts/wpt/browser/run.ts`) may import `child_process`.
- **Solution**: Always import `safeExecTestFile` and `safeWorkerPool` from `scripts/wpt/node/safe-child-process.ts`. Every child process spawned via `safeExecTestFile` is constrained with `--max-old-space-size=512`, guarded by a 250ms `/proc/[pid]/stat` RSS (>2048MB) and state 'D' watchdog (`SIGKILL`), and tracked for cleanup upon parent termination.

### DOM & Cyclic Object Assertion Safety
`node:assert/strict` structural diffs on cyclic DOM nodes explode heap memory (>8GB) and crash the host.
- **Rule**: Never pass DOM nodes or cyclic objects directly to `assert.equal` / `assert.deepStrictEqual`. Compare scalars (`assert.equal(a?.id, '...')`), booleans (`assert.ok(a === b)`), or use cycle-safe formatters (`format_value(val)`).

### Test Isolation & Event Loop Safety
- **Pure Unit Tests**: Tests in `tests/**/*.test.ts` (`pnpm test:node`) must remain 100% in-memory without spawning child processes.
- **Watchdog Unref**: All background watchdog/polling intervals must call `timer.unref()` immediately so timers do not keep the Node event loop alive.
- **Progress Hash Reconciliation**: Reconcile unfinalized pre-commit hashes (`*`) in `wpt-progress.md` via `syncProgressFromNotes()` using `git notes` and `git log`.

## Spec Evolution & Maintainability

### Automation Over Hardcoding
As CSS specifications evolve, this codebase must evolve with them. We prioritize automation over manual maintenance for spec-derived data.
- **Rule**: Whenever adding support for new properties, values, units, or features that are documented in external data sources (like `mdn-data` or `@webref/css`), ALWAYS prefer updating or creating a code generation script in `scripts/codegen/` rather than hardcoding lists in implementation files.
- **Rule**: Ensure that any new generation script is added to the master script `scripts/codegen/generate_all.ts` and that the `pnpm run codegen` command functions correctly.
- **Rule**: The `maintain` script in `package.json` must always include `pnpm run codegen` to ensure that updating submodules automatically updates our generated data.

## Instructions for Agents
- You MUST **Update PLAN.md** when you are done with tasks, or if you need to update the plan or context.
- **Prioritize Conformance**: The ultimate goal is to pass the W3C CSSOM conformance tests.
- Run 'pnpm run preflight' before committing and address failures.
- **Attribution Clarification**: If you see a message like "The following changes were made by the USER ...", those changes are almost certainly made by a subagent, not the user.
- **The Multi-Agent Quality Loop**: You MUST strictly adhere to the multi-agent developer-reviewer-gatekeeper workflow and anti-greenwashing policies defined in [LOOP.md](file:///usr/local/google/home/paulirish/code/cssom/LOOP.md). Review the checklist, bug bars, and subagent settings before launching any code edits or reviews.
- **Subagent Submodule Optimization**: Spawning subagents in isolated workspaces (`share` mode) leaves submodule folders empty. Cloning or copying the 1.3 GB `web-platform-tests` submodule is extremely slow. Instead, the subagent (or the parent during setup) should **symlink** the parent's `submodules/` directory into the subagent's workspace (e.g., `ln -s <parent_dir>/submodules submodules`) to gain instant, zero-copy access to spec files and WPT tests without network latency.


