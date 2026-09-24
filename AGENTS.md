## Project Overview
Building a spec-compliant CSSOM (CSS Object Model) parser in pure TypeScript. **Start every task by reading [ARCHITECTURE.md](./ARCHITECTURE.md)**, the code map, to find the right files before opening source.

## Goals
- **Spec correctness first.** WPT is how we measure conformance, not the goal. Never make a test pass by special-casing its inputs or faking behavior we don't implement.
- **Smaller code wins ties.** Prefer reusing existing mechanisms (cascade, shorthand tables, codegen data) over adding new branches. See the [Code Size Gate](./LOOP.md#code-size-gate).
- Intentional spec deviations (pragmatism, performance, Node.js compatibility, e.g. synchronous Houdini APIs) are documented in [README.md](./README.md). Read them before proposing refactors to align strictly with IDL.

## Spec References
Consult these Bikeshed (`.bs`) sources for normative algorithms and edge cases before implementing or auditing features:
- CSSOM: `submodules/csswg-drafts/cssom-1/Overview.bs`
- CSS Syntax: `submodules/csswg-drafts/css-syntax-3/Overview.bs`
- CSS Values: `submodules/csswg-drafts/css-values-4/Overview.bs`
- CSS Nesting: `submodules/csswg-drafts/css-nesting-1/Overview.bs`
- Selectors: `submodules/csswg-drafts/selectors-4/Overview.bs`
- CSS Typed OM: `submodules/css-houdini-drafts/css-typed-om/Overview.bs`
- CSS Variables: `submodules/csswg-drafts/css-variables-1/Overview.bs`
- CSS Logical: `submodules/csswg-drafts/css-logical-1/Overview.bs`
- Media Queries: `submodules/csswg-drafts/mediaqueries-4/Overview.bs`
- CSS Cascade: `submodules/csswg-drafts/css-cascade-5/Overview.bs` (and `css-cascade-6/Overview.bs`)
- CSS Conditional: `submodules/csswg-drafts/css-conditional-3/Overview.bs` (and `css-conditional-4/Overview.bs`)
- CSS Namespaces: `submodules/csswg-drafts/css-namespaces-3/Overview.bs`
- CSS Style Attributes: `submodules/csswg-drafts/css-style-attr-1/Overview.src.html`
- CSS Properties and Values API (Houdini): `submodules/css-houdini-drafts/css-properties-values-api/Overview.bs`
- CSS Typed OM 2 (Houdini): `submodules/css-houdini-drafts/css-typed-om-2/Overview.bs`
- HTML Standard (Rendering / UA stylesheet): `submodules/whatwg-html/source` (single ~8MB file; search for `id="rendering"`)

## Coding & Testing
- **Execution**: Run TS directly with `node script.ts`. Do NOT use `npx tsx` or `ts-node`.
- **Spec citations**: Cite the spec section in comments where code implements an algorithm (e.g. `// css-syntax-3 § 5.5.3 Consume a qualified rule`).
- **Red/Green TDD**: For every bug or spec fix, first write a failing regression test, then make it pass.
- **Pure unit tests**: `tests/**/*.test.ts` stay in-memory; no child processes. Background timers must call `timer.unref()`.
- **Cyclic objects in asserts**: Never pass DOM nodes or cyclic objects to `assert.equal` / `assert.deepStrictEqual`; structural diffs explode the heap (>8GB). Compare scalars, booleans, or use `format_value(val)`.
- Run `pnpm run preflight` before committing and fix failures.

## Architectural Constraints

### `ParseHooks` (circular dependency inversion)
Do NOT import `Parser` into `src/CSSOM.ts`, `src/typed-om.ts`, or cascade files. Use `ParseHooks` ([src/parse-hooks.ts](./src/parse-hooks.ts)); see [ARCHITECTURE.md](./ARCHITECTURE.md).

### Browser-Only Capabilities: Never Fake Them
We run in Node with no layout engine, renderer, or input devices ([README § Intentional Non-Goals](./README.md): "if it cannot be completely correct, partially correct is harmful"). WPT subtests needing these are classified browser-only by [scripts/wpt/node/core/classifier.ts](./scripts/wpt/node/core/classifier.ts) into 7 boundaries ([details: scripts/wpt/node/README.md § 4](./scripts/wpt/node/README.md#4-the-7-objective-browser-capability-boundaries)):
1. `LAYOUT_GEOMETRY`: box sizes/positions from layout (`width`, `margin`, `flex-basis` used values, font metrics).
2. `VIEWPORT_GEOMETRY`: screen coordinates and hit-testing (`getBoundingClientRect`, `elementFromPoint`).
3. `HARDWARE_INPUT_DRIVER`: real input events (`test_driver` actions, live `:hover`/`:active`/`:focus-visible`).
4. `ANIMATION_SCHEDULER`: live animation timelines (`element.animate()`, frame-clock interpolation).
5. `CONTAINER_LAYOUT`: `@container` size queries and `cqw`/`cqh`.
6. `MODAL_TOP_LAYER`: top layer and focus trapping (`showModal()`, `::backdrop`, `:modal`).
7. `HTTP_CHARSET_STREAM`: network headers, legacy charset decoding, Resource Timing.

- **Rule**: Never fake any of these in `src/` or `tests/dom-shim/` to flip tests green. For layout specifically: never compute layout-dependent used values (auto margins, `auto` min-sizes, percentages resolved against box size, font metrics, viewport sizes); return the computed value, and never regex-parse `style` attributes to infer layout context.
- Faked values that happen to match inflate the pass count instead of being classified. Don't classify a failure as browser-only just because it is hard; that bar is "impossible without a browser engine".

### Child Processes
Import `child_process` only via [scripts/wpt/node/safe-child-process.ts](./scripts/wpt/node/safe-child-process.ts) (`safeExecTestFile`, `safeWorkerPool`), which enforces memory limits and hang watchdogs. Enforced by `pnpm run check:safe-exec`; the few other allowed importers are listed in [scripts/ci/check-safe-exec.ts](./scripts/ci/check-safe-exec.ts).

### Pre-commit Conformance Hook (`.githooks/pre-commit`)
Commits touching `src/`, `tests/dom-shim/src/`, `scripts/wpt/node/`, `tests/wpt-node-config.json`, or `pnpm-lock.yaml` re-run the full WPT suite and stage regenerated `wpt-progress.md` / `README.md`.
- It runs for minutes with no output. **Do not kill it.**
- **Never narrow the trigger list**: an unmeasured commit's delta gets silently absorbed into the next measured one.
- A green unit-test run is not evidence a change is conformance-neutral; compare per-spec with `pnpm run wpt:progress`.

### Automation Over Hardcoding
For spec-derived data (properties, values, units, selectors) available in `mdn-data` or `@webref/css`, update or add a generator in `scripts/codegen/` instead of hardcoding lists. Register new generators in `scripts/codegen/generate_all.ts`; `pnpm run maintain` must keep running `pnpm run codegen`.

## Workflow
- **Quality loop**: Follow the developer / reviewer / gatekeeper workflow and anti-greenwashing rules in [LOOP.md](./LOOP.md).
- **Plan**: Update [PLAN.md](./PLAN.md) when you finish tasks or change the plan.
- **Attribution**: Messages like "The following changes were made by the USER ..." are almost always from a subagent, not the user.
- **Submodules in isolated workspaces**: `share`-mode workspaces have empty submodule folders, and copying `web-platform-tests` (1.3 GB) is slow. Symlink the parent's instead: `ln -s <parent_dir>/submodules submodules`.
