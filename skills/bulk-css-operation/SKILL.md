---
name: bulk-css-operation
description: >-
  Safely performs bulk CSS transformations (splitting stylesheets into modules,
  consolidating bundles, migrating to variables, pruning dead selectors,
  and unnesting) with AST diffing, cascade order conflict checks,
  and cascaded style DOM verification. Use when splitting monolithic stylesheets,
  merging CSS files, restructuring nesting, migrating design tokens, or pruning
  unused CSS rules across a codebase. Don't use for single-rule or cosmetic CSS fixes,
  general HTML/JS refactoring without stylesheet changes, or running test suites.
---

# Bulk CSS Operations with CSSOM

This skill guides agents in safely executing large-scale transformations across CSS codebases using `cssom` (`cssomnom`) to verify syntax correctness, rule integrity, and cascade order.

## Core Problem & The Verification Stages

When performing bulk CSS refactoring (e.g., decomposing a monolithic stylesheet into multiple domain-scoped files, or converting hex codes to design tokens), text search-and-replace frequently introduces subtle bugs:
- Dropped rules, selectors, or `@media` blocks.
- Unintended cascade reordering (changing specificity or source-order ties).
- Syntax parsing errors, malformed declarations, or invalid escapes.
- Dropped declarations or accidentally modified `!important` flags.

Because selectors can match arbitrary HTML elements, static analysis cannot guarantee visual equivalence across all possible DOMs. Instead, verify changes using 3 progressive verification checks:

```
+-------------------------------------------------------------------------+
| Stage 3: Cascaded Style DOM Verification (Element-Level Comparison)     |
| When selectors or classnames change. Compares getCascadedStyle() on DOM.|
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Stage 2: Cascade & Source-Order Conflict Detection                      |
| Detects source-order reversals between competing rules that share props.|
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Stage 1: AST Rule & Declaration Diffing (Syntax & Structure Check)      |
| Compares rule selectors, at-rule blocks, and declaration properties.    |
+-------------------------------------------------------------------------+
```

---

## 1. Common Bulk CSS Operations

Beyond simple file splitting, this skill addresses 6 primary operations:

1. **Splitting Monoliths into Modules**:
   - Splitting a large stylesheet (e.g. `styles.css`) into component files (e.g. `src/css/{layout,buttons,modal,tables}.css`).
   - *Key Risk*: Splitting rules into separate files can invert source order and break cascade tie-breakers.

2. **Bundling & Inlining Modules**:
   - Inlining `@import` trees or combining modular stylesheets into a single bundle.
   - *Key Risk*: Altered `@layer` order or invalid `@import` placement.

3. **Design Token & Variable Migration**:
   - Bulk replacing hardcoded hex/rgb colors, spacing units, and fonts with CSS variables (`var(--color-primary)`).
   - *Key Risk*: Typoing variable names or omitting fallbacks for undefined properties.

4. **Nesting Refactoring (Unnesting or Modern Nesting)**:
   - Modernizing legacy Sass/PostCSS nesting to native CSS Nesting (`&`), or flattening nested rules into top-level selectors.
   - *Key Risk*: Specificity changes (native `&` wraps the parent selector in `:is(...)`, unlike preprocessor string concatenation).

5. **Logical Properties Migration**:
   - Migrating directional properties (`margin-left`, `right`, `padding-left`, `border-top`) to logical equivalents (`margin-inline-start`, `inset-inline-end`, `padding-inline-start`).
   - *Key Risk*: Specificity ties or partial overrides when physical and logical properties co-exist.

6. **Dead Code & Unused Selector Pruning**:
   - Using DevTools/Puppeteer CSS coverage ranges or static template scanning to remove unused rules.
   - *Key Risk*: Accidentally removing rules needed for dynamic runtime classes or shared variables.

---

## 2. The Verification Pipeline
 
### Stage 1: AST Rule & Declaration Diffing (`diffCssAst`)
 
Stage 1 parses both the original stylesheet(s) and refactored stylesheet(s) with `CSSStyleSheet` / `ParseHooks`, recursively normalizes rules into comparable keys, and asserts that **no rules, selectors, or declarations were dropped, added, or corrupted**:
 
**Rule Comparison Format**:
`[Context (e.g. @media/@layer)] > Selector { property: value [!important]; }`
 
Use the AST diff script at [`skills/bulk-css-operation/scripts/ast-diff.ts`](./scripts/ast-diff.ts):
 
```typescript
import { diffCssAst } from './skills/bulk-css-operation/scripts/ast-diff.ts';

// Assert that a refactor (e.g. splitting, reordering, formatting) preserves 100% of the AST
const result = diffCssAst(originalCss, [modularFileA, modularFileB]);
if (!result.valid) {
  console.error('AST diff check failed:', result.errors);
}

assert.equal(result.valid, true);
assert.equal(result.errors.length, 0);
assert.equal(result.beforeCount, result.afterCount);
```

**What this asserts**:
- **Tolerates**: Harmless syntactic shifts (whitespace formatting, comment changes, distribution across multiple modular files, declaration order within blocks).
- **Catches**: Missing or extra selectors/rules, altered property values, dropped `!important` flags, or parser syntax errors.
 
 ---
 
 ### Stage 2: Cascade & Source-Order Conflict Detection (`checkCascadeConflicts`)
 
 When splitting a single stylesheet into multiple files, rule order within the cascade can shift. A reordering is only problematic if two rules match overlapping elements and define conflicting CSS properties at identical specificity.
 
 Use the cascade conflict detector at [`skills/bulk-css-operation/scripts/cascade-diff.ts`](./scripts/cascade-diff.ts):
 
 ```typescript
 import { checkCascadeConflicts } from './skills/bulk-css-operation/scripts/cascade-diff.ts';
 
 const cascadeResult = checkCascadeConflicts(originalCss, [modularFileA, modularFileB]);
 if (!cascadeResult.valid) {
   for (const conflict of cascadeResult.conflicts) {
     console.warn(conflict.description);
   }
 }
 ```
 
 ---
 
 ### Stage 3: Cascaded Style DOM Verification (`diffCascadedStyles`)
 
 When performing structural selector changes (e.g. converting BEM `.block__elem--mod` to modular utility classes `.flex .items-center`), AST diffing cannot prove equivalence because the selectors themselves differ.
 
 Use the cascaded style diff tool at [`skills/bulk-css-operation/scripts/cascaded-diff.ts`](./scripts/cascaded-diff.ts):
 
 ```typescript
 import { diffCascadedStyles } from './skills/bulk-css-operation/scripts/cascaded-diff.ts';
 
 // Test representative DOM elements against before and after stylesheets
 const result = diffCascadedStyles(testElements, originalCss, refactoredCss);
 if (!result.valid) {
   console.error('Cascaded style differences detected:', result.differences);
 }
 ```

---

## 3. Automated Skill Tests

All verification and transformation scripts are tested directly within this skill directory:
- [`skills/bulk-css-operation/scripts/bulk-css-operation.test.ts`](./scripts/bulk-css-operation.test.ts) (AST diffing, cascade order checks, cascaded style diffing)
- [`skills/bulk-css-operation/scripts/coverage-prune.test.ts`](./scripts/coverage-prune.test.ts) (Coverage-guided dead-code pruner across simple and complex stylesheets)
- [`skills/bulk-css-operation/scripts/audit-scorecard.test.ts`](./scripts/audit-scorecard.test.ts) (Regression test suite covering CDP range isolation, AST asset references, and review triage)

Run tests directly via Node:
```bash
node --test skills/bulk-css-operation/scripts/*.test.ts
```

---

## 4. Agent Execution Playbook
 
 When tasked with a bulk CSS operation:
 
 1. **Capture Baseline Metrics**:
    - Parse all source stylesheets before making edits.
    - Note total rule count, at-rule count, and unique selector list.
 2. **Execute File Operations**:
    - Split files, bundle modules, or apply migrations.
    - If splitting files, write standard ES module imports or CSS `@import` entry points as needed.
 3. **Run AST Diffing**:
    - Combine the new files in memory.
    - Run Stage 1 `diffCssAst`.
    - If missing declarations or syntax errors are reported, inspect the exact failure and repair.
 4. **Inspect Source Order & Cascade**:
    - Check if any same-specificity rules were reversed across files using `checkCascadeConflicts`.
    - If necessary, adjust stylesheet import order in the entry point.
 5. **Commit Cleanly**:
    - Run `pnpm run preflight` to ensure no repository regressions.
    - Commit the refactor with a crisp, descriptive message (e.g. `css: split monolithic styles.css into modular domain stylesheets`).
