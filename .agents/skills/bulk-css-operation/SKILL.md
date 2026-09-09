---
name: bulk-css-operation
description: >-
  Safely performs bulk CSS transformations (modularizing monolithic stylesheets,
  consolidating bundles, migrating to tokens or variables, pruning dead selectors,
  and unnesting) with AST set-difference verification, cascade ordering invariant
  checks, and DOM-grounded sampling. Use when splitting monolithic stylesheets,
  merging CSS files, restructuring nesting, migrating design tokens, or pruning
  unused CSS rules across a codebase. Don't use for single-rule or cosmetic CSS fixes,
  general HTML/JS refactoring without stylesheet changes, or running test suites.
---

# Bulk CSS Operations with CSSOM

This skill guides agents in safely executing large-scale, bulk transformations across CSS codebases using `cssom` (`cssomnom`) to guarantee syntax correctness, rule integrity, and semantic equivalence.

## Core Problem & The Verification Ladder

When performing bulk CSS refactoring (e.g., decomposing a 3,000-line monolithic stylesheet into 15 domain-scoped modular files, or converting hex codes to design tokens), text regexes and string find-and-replace often introduce subtle, catastrophic bugs:
- Dropped rules, selectors, or `@media` blocks.
- Unintended cascade reordering (changing specificity or source-order ties).
- Syntax parsing errors, malformed declarations, or invalid escapes.
- Dead declarations or accidentally modified `!important` flags.

Attempting to resolve semantic equivalence by computing cascaded styles across arbitrary, unbounded selector space is an ill-defined problem without a concrete DOM (since selectors match an infinite set of theoretical elements). Instead, verify changes using the **3-Tier Verification Ladder**:

```
+-------------------------------------------------------------------------+
| Level 3: DOM-Grounded Oracle Sampling (Element Matched & Cascaded Style)|
| Target: When selectors or classnames change. Sample authentic HTML DOMs.|
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Level 2: Cascade & Source-Order Conflict Invariants                     |
| Target: Detect source-order swaps between overlapping, competing rules. |
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Level 1: Static AST Rule & Declaration Set-Difference (Zero-DOM)        |
| Target: 100% rule, selector, at-rule context, and declaration match.    |
+-------------------------------------------------------------------------+
```

---

## 1. High-Impact Bulk CSS Operations

Beyond simple file splitting, this skill addresses 6 primary classes of bulk CSS transformations:

1. **Monolith Modularization (1 to N Files)**:
   - Splitting a large monolithic file (e.g. `styles.css`) into component-level files (e.g. `src/css/{layout,buttons,modal,tables}.css`).
   - *Key Risk*: Splitting rules into separate files can invert source order and break cascade tie-breakers.

2. **De-modularization & Inlining (N to 1 File)**:
   - Flattening `@import` trees or merging modular files into a unified bundle without relying on opaque build tooling.
   - *Key Risk*: Altered `@layer` statement precedence or `@import` placement rules.

3. **Design Token & CSS Variable Migration**:
   - Bulk replacing hardcoded hex/rgb colors, spacing units, and fonts with CSS custom properties (`var(--color-brand-primary)`).
   - *Key Risk*: Altering declaration values or referencing unregistered/undefined custom properties without fallback values.

4. **CSS Nesting Restructuring (Unnesting or Modern Nesting)**:
   - Modernizing legacy SASS/PostCSS nesting into native CSS Nesting Level 1 (`&`), or flattening native nested rules into explicit qualified selectors.
   - *Key Risk*: Incorrect specificity calculations (native `&` wraps the selector in `:is(...)`, modifying specificity dynamics compared to preprocessor string concatenation).

5. **CSS Logical Properties Migration**:
   - Migrating directional properties (`margin-left`, `right`, `padding-left`, `border-top`) to internationalized logical equivalents (`margin-inline-start`, `inset-inline-end`, `padding-inline-start`).
   - *Key Risk*: Overriding physical properties unintentionally when both exist in the cascade.

6. **Dead Code & Unused Selector Pruning**:
   - Cross-referencing parsed CSS selectors against an application's JSX/HTML template ASTs to remove obsolete rules.
   - *Key Risk*: Removing rules used dynamically by runtime class string templates.

---

## 2. The Verification Pipeline

### Level 1: Static AST Set-Difference (Mandatory)

Level 1 parses both the original stylesheet(s) and refactored stylesheet(s) with `CSSStyleSheet` / `ParseHooks`, recursively flattens the rules into canonical keys, and computes set differences.

**Canonical Rule Key Format**:
`[Scope / At-Rule Context] > Selector { property: value [!important]; }`

Use the AST diff script at [`.agents/skills/bulk-css-operation/scripts/ast-diff.ts`](./scripts/ast-diff.ts):

```typescript
import { diffCssAst } from './.agents/skills/bulk-css-operation/scripts/ast-diff.ts';

const result = diffCssAst(originalCss, [modularFileA, modularFileB]);
if (!result.valid) {
  console.error('Parity check failed:', result.errors);
}
```

---

### Level 2: Cascade & Source-Order Invariant Checking

When splitting a single file into multiple modular files, rule order within the cascade often shifts. A reordering is **only dangerous** if two rules match overlapping elements and define conflicting properties at identical specificity.

Use the cascade conflict detector at [`.agents/skills/bulk-css-operation/scripts/cascade-diff.ts`](./scripts/cascade-diff.ts):

```typescript
import { checkCascadeInversions } from './.agents/skills/bulk-css-operation/scripts/cascade-diff.ts';

const cascadeResult = checkCascadeInversions(originalCss, [modularFileA, modularFileB]);
if (!cascadeResult.valid) {
  for (const conflict of cascadeResult.conflicts) {
    console.warn(conflict.description);
  }
}
```

---

### Level 3: DOM-Grounded Oracle Sampling

When performing structural selector changes (e.g. converting BEM `.block__elem--mod` to modular utility classes `.flex .items-center`), static AST set-difference cannot prove equivalence because the selectors themselves differ.

Use the DOM computed style diff tool at [`.agents/skills/bulk-css-operation/scripts/computed-diff.ts`](./scripts/computed-diff.ts):

```typescript
import { diffComputedStyles } from './.agents/skills/bulk-css-operation/scripts/computed-diff.ts';

// Sample representative DOM elements from application fixtures / JSDOM / linkedom
const domResult = diffComputedStyles(sampledElements, originalCss, refactoredCss);
if (!domResult.valid) {
  console.error('DOM computed style differences detected:', domResult.differences);
}
```

---

## 3. Automated Skill Tests

All 3 verification scripts are tested within this skill directory at [`.agents/skills/bulk-css-operation/scripts/bulk-css-operation.test.ts`](./scripts/bulk-css-operation.test.ts).

Run tests directly via Node:
```bash
node --test .agents/skills/bulk-css-operation/scripts/bulk-css-operation.test.ts
```

---

## 4. Agent Execution Playbook

When tasked with a bulk CSS operation:

1. **Baseline Invariant Capture**:
   - Parse all source CSS files before making any edits.
   - Record total rule count, at-rule count, and unique selector set.
2. **Execute File Operations**:
   - Create modular files or apply transformations.
   - If splitting files, write standard ES module imports or CSS `@import` entry points as needed.
3. **Run AST Difference Verification**:
   - Concatenate or bundle the new files into an aggregate in-memory string.
   - Run the Level 1 `diffCssAst` script.
   - If missing declarations or syntax errors are reported, inspect the exact failure line and repair.
4. **Inspect Source Order & Cascade**:
   - Check if any identical-specificity rules have been reversed across separate files using `checkCascadeInversions`.
   - If necessary, adjust file import order in the entry point stylesheet.
5. **Commit Cleanly**:
   - Run `pnpm run preflight` to ensure no repository regressions.
   - Commit the refactor with a crisp, descriptive message (e.g. `css: split monolithic styles.css into modular domain stylesheets`).
