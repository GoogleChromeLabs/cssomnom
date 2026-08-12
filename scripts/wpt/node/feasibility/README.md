# WPT Feasibility Baseline & Delphi Consensus Workflow

This directory contains the tools and methodology used to establish, audit, and maintain the **Feasibility Baseline** and **Normalized Conformance** metrics for `cssomnom` across W3C Web Platform Tests (WPT) running in pure Node.js (`pnpm run wpt:node:progress`).

---

## 1. Core Principles & Philosophy

`cssomnom` builds a spec-compliant CSS Object Model (CSSOM) and Typed OM parser in pure TypeScript. 

- **Pure Node.js Environment**: The test harness runs inside Node.js using an in-memory DOM ([LinkeDOM](https://github.com/WebReflection/linkedom)) without a visual browser layout engine, GPU rasterizer, or OS windowing system.
- **Anti-Greenwashing Invariant**: We never declare a test "out of scope" simply because it is hard, buggy, or requires non-trivial AST manipulation. A test is considered out-of-scope **only if it is physically impossible to satisfy in headless Node.js without a full browser engine** (e.g. 2D layout geometry, font rasterization, WebDriver hardware event synthesis, or HTTP byte-stream decoding).
- **Single Source of Truth**: The explicit, file-by-file JSON manifest at [`tests/fixtures/wpt-browser-only-manifest.json`](../../../tests/fixtures/wpt-browser-only-manifest.json) is the sole authority on excluded tests. No magic numbers or hardcoded count dictionaries are permitted in the codebase.

---

## 2. Terminology & Mathematical Definitions

| Metric | Symbol | Definition |
| :--- | :---: | :--- |
| **Total Tests** | $N$ | Total test assertion instances across the 7 tracked WPT CSS test suites. |
| **Passing Tests** | $P$ | Verified passing assertion instances in pure Node.js (`pnpm run wpt:node`). |
| **Browser-Only Exclusions** | $E$ | Test assertion instances consensus-agreed as physically impossible in pure Node.js. |
| **Feasible Target** | $M$ | The achievable Node.js target: $$M = \max(P, N - E)$$ |
| **Raw Pass Rate** | — | Percentage of all WPT tests passing: $$\text{Raw Score} = \frac{P}{N} \times 100$$ |
| **Normalized Conformance** | — | Percentage of achievable pure-Node tests passing: $$\text{Normalized} = \min\left(100.00\%, \frac{P}{M} \times 100\right)$$ |

---

## 3. Objective Scope Classification Criteria

To ensure classifications remain fair, objective, and reproducible across the codebase lifecycle, failures are evaluated against explicit capability boundaries:

### A. Declarative Cascade vs. Layout Geometry (`getComputedStyle`)
- **IN-SCOPE (Declarative Cascade Oracle)**:
  - Tests calling `getComputedStyle(element)` where the assertion checks whether a CSS rule matched or a variable substituted (e.g. `getComputedStyle(el).color === 'rgb(0, 128, 0)'` or `getComputedStyle(el).getPropertyValue('--foo')`).
  - Handled in pure TypeScript via `getCascadedStyle(element)` in [`src/cascade.ts`](../../../src/cascade.ts), resolving specificity `[A, B, C]`, `!important`, source order, property inheritance (`color`, `direction`, `writing-mode`), and CSS Color 4 normalization (`normalizeComputedColor`).
- **OUT-OF-SCOPE (Visual Layout Engine Required)**:
  - Tests asserting layout-resolved `px` dimensions derived from `auto`, font metrics, text glyph layout, line-height geometry, or flex/grid box positioning (e.g. `getComputedStyle(el).width === '143.5px'`).

### B. DOM Viewport & 2D Coordinate Geometry
- **OUT-OF-SCOPE**:
  - `element.getClientRects()`, `element.getBoundingClientRect()`.
  - `document.caretPositionFromPoint(x, y)`, `document.caretRangeFromPoint(x, y)` coordinate hit-testing.

### C. Interactive Hardware / OS Input Drivers
- **OUT-OF-SCOPE**:
  - `testdriver.js action_sequence()` simulating OS-level hardware mouse clicks, pointer movements, drag-and-drop, or keyboard focus ring heuristics (`:focus-visible`).

### D. Web Animations & Transition Timelines
- **OUT-OF-SCOPE**:
  - Frame-by-frame `@keyframes` value interpolation over time and `element.animate()` timing clocks requiring a browser animation frame scheduler.

### E. HTML5 Top-Layer & Modal Focus Stacking
- **OUT-OF-SCOPE**:
  - `<dialog>` modal top-layer isolation (`dialog.showModal()`), `<popover>`.

### F. HTTP Network Transport & Legacy Character Encodings
- **OUT-OF-SCOPE**:
  - External `<link rel="stylesheet">` HTTP `Content-Type` charset negotiation and byte-stream encoding fallback precedence (`page-windows-1251-*`).

---

## 4. The 3-Way Delphi Consensus Workflow

When updating or re-evaluating the feasibility baseline, follow this 6-step pipeline:

```
[ Step 1: Export Dataset ] ──> [ Step 2: 3-Way Delphi Voting ] ──> [ Step 3: Reconcile Consensus ]
                               (Scrutineer / Grizz / Architect)
                                             │
[ Step 6: Sync Progress ]  <──  [ Step 5: Run Audit ]  <──  [ Step 4: Generate Manifest ]
```

### Step 1: Extract Live Failure Dataset
Crawl all 7 WPT suites and categorize remaining failures into structured clusters:
```bash
node scripts/wpt/node/feasibility/export_dataset.ts
```
*Output*: [`scratch/wpt_failure_dataset.json`](../../../scratch/wpt_failure_dataset.json).

### Step 2: Dispatch 3 Delphi Subagents
Launch three independent subagents with distinct review roles to audit `scratch/wpt_failure_dataset.json`:
1. **Spec Compliance Scrutineer**: Evaluates normative compliance against W3C Bikeshed specifications (`cssom-1`, `selectors-4`, `css-typed-om-1`, etc.).
   *Output*: `scratch/feasibility_scrutineer.json`.
2. **Hostile Gatekeeper Grizz**: Skeptical principal engineer rejecting lazy "browser-only" excuses when in-memory AST or declarative cascade logic can solve it.
   *Output*: `scratch/feasibility_grizz.json`.
3. **Systems Architect**: Evaluates pure Node.js isomorphic execution boundaries vs. browser engine dependencies.
   *Output*: `scratch/feasibility_architect.json`.

### Step 3: Reconcile Consensus & Divergence
Compare votes across all clusters to determine Unanimous In-Scope, Unanimous Out-of-Scope, and Contested items:
```bash
node scripts/wpt/node/feasibility/compare_votes.ts
```

### Step 4: Generate File-Level Manifest
Generate the updated manifest from consensus out-of-scope clusters and partitioned contested files:
```bash
node scripts/wpt/node/feasibility/generate_manifest.ts
```
*Output*: [`tests/fixtures/wpt-browser-only-manifest.json`](../../../tests/fixtures/wpt-browser-only-manifest.json).

### Step 5: Verify Normalized Conformance
Run the feasibility audit to inspect the updated baseline metrics:
```bash
node scripts/wpt/node/feasibility/audit.ts
```

### Step 6: Synchronize Historical Conformance Log
Rebaseline the historical log and baseline summary table in `wpt-progress.md`:
```bash
node scripts/baselines/rebaseline_wpt_history.ts
```

---

## 5. Directory Map

- [`audit.ts`](./audit.ts): Computes Feasible Target and Normalized Conformance by dynamically querying the JSON manifest.
- [`export_dataset.ts`](./export_dataset.ts): Crawls WPT suites, categorizes failures by signature, and exports the cluster dataset.
- [`compare_votes.ts`](./compare_votes.ts): Ingests the 3 subagent vote datasets and renders the 3-Way Delphi Consensus & Divergence report.
- [`generate_manifest.ts`](./generate_manifest.ts): Generates `tests/fixtures/wpt-browser-only-manifest.json` from Delphi consensus.
