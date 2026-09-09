---
name: bulk-css-operation
description: Safely perform bulk CSS operations (modularizing, consolidating, tokenizing, pruning) with AST set-difference verification, cascade ordering invariant checks, and DOM-grounded sampling using cssom.
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

#### Level 1 Verification Script

Save and run this script using pure Node (`node script.ts`):

```typescript
import { CSSStyleSheet, CSSRule, CSSStyleRule, CSSGroupingRule } from 'cssomnom';

interface RuleRecord {
  context: string;
  selector: string;
  declarations: Map<string, { value: string; priority: string }>;
}

function extractRuleRecords(
  rules: CSSRuleList,
  parentContext = ''
): RuleRecord[] {
  const records: RuleRecord[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];

    if (rule instanceof CSSStyleRule) {
      const decls = new Map<string, { value: string; priority: string }>();
      const style = rule.style;
      for (let j = 0; j < style.length; j++) {
        const prop = style.item(j);
        decls.set(prop, {
          value: style.getPropertyValue(prop).trim(),
          priority: style.getPropertyPriority(prop).trim(),
        });
      }

      records.push({
        context: parentContext,
        selector: rule.selectorText.trim(),
        declarations: decls,
      });
    } else if (rule instanceof CSSGroupingRule || 'cssRules' in rule) {
      // Grouping rules: @media, @supports, @layer, @scope, etc.
      const grouping = rule as CSSGroupingRule;
      const header = (rule as { cssText?: string }).cssText?.split('{')[0]?.trim() || '@group';
      const nestedContext = parentContext ? `${parentContext} > ${header}` : header;
      records.push(...extractRuleRecords(grouping.cssRules, nestedContext));
    }
  }

  return records;
}

export function verifyStylesheetParity(beforeCss: string, afterCss: string) {
  const sheetBefore = new CSSStyleSheet();
  sheetBefore.replaceSync(beforeCss);

  const sheetAfter = new CSSStyleSheet();
  sheetAfter.replaceSync(afterCss);

  const beforeRecords = extractRuleRecords(sheetBefore.cssRules);
  const afterRecords = extractRuleRecords(sheetAfter.cssRules);

  console.log(`Before: ${beforeRecords.length} style rules parsed`);
  console.log(`After:  ${afterRecords.length} style rules parsed`);

  const errors: string[] = [];

  // 1. Check for missing or duplicate rules
  const makeKey = (r: RuleRecord) => `${r.context} ::: ${r.selector}`;
  const beforeMap = new Map<string, RuleRecord[]>();
  const afterMap = new Map<string, RuleRecord[]>();

  for (const r of beforeRecords) {
    const key = makeKey(r);
    const list = beforeMap.get(key) || [];
    list.push(r);
    beforeMap.set(key, list);
  }

  for (const r of afterRecords) {
    const key = makeKey(r);
    const list = afterMap.get(key) || [];
    list.push(r);
    afterMap.set(key, list);
  }

  // Verify all keys in Before exist in After with matching counts
  for (const [key, bList] of beforeMap.entries()) {
    const aList = afterMap.get(key);
    if (!aList) {
      errors.push(`MISSING RULE: ${key} was dropped in refactored CSS`);
      continue;
    }
    if (aList.length !== bList.length) {
      errors.push(`OCCURRENCE MISMATCH: ${key} occurs ${bList.length} times before, but ${aList.length} times after`);
    }

    // Compare declarations across occurrences
    for (let idx = 0; idx < Math.min(bList.length, aList.length); idx++) {
      const bDecls = bList[idx].declarations;
      const aDecls = aList[idx].declarations;

      for (const [prop, bVal] of bDecls.entries()) {
        const aVal = aDecls.get(prop);
        if (!aVal) {
          errors.push(`MISSING DECLARATION: ${key} [${idx}] missing property '${prop}'`);
        } else if (aVal.value !== bVal.value || aVal.priority !== bVal.priority) {
          errors.push(`DECLARATION MISMATCH: ${key} [${idx}] property '${prop}': '${bVal.value}' (${bVal.priority}) !== '${aVal.value}' (${aVal.priority})`);
        }
      }

      for (const prop of aDecls.keys()) {
        if (!bDecls.has(prop)) {
          errors.push(`EXTRA DECLARATION: ${key} [${idx}] contains unexpected added property '${prop}'`);
        }
      }
    }
  }

  for (const key of afterMap.keys()) {
    if (!beforeMap.has(key)) {
      errors.push(`UNEXPECTED RULE: ${key} was added in refactored CSS`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

---

### Level 2: Cascade & Source-Order Invariant Checking

When splitting a single file into multiple modular files, rule order within the cascade often shifts. A reordering is **only dangerous** if two rules match overlapping elements and define conflicting properties at identical specificity.

#### Detecting Cascade Inversions

To detect if modularization reversed rule order for conflicting selectors:
1. Identify all pairs of selectors $(R_1, R_2)$ in the original stylesheet where $Index(R_1) < Index(R_2)$.
2. Check if $Specificity(R_1) == Specificity(R_2)$ and both rules define at least one common CSS property.
3. Check if $R_1$ and $R_2$ can overlap (e.g., both are class selectors `.btn` and `.primary`, or tag/class combinations).
4. If $Index_{after}(R_1) > Index_{after}(R_2)$, flag a potential **Cascade Ordering Inversion**.

---

### Level 3: DOM-Grounded Oracle Sampling

When performing structural selector changes (e.g. converting BEM `.block__elem--mod` to modular utility classes `.flex .items-center`), static AST set-difference cannot prove equivalence because the selectors themselves differ.

Use `getCascadedStyle(element, rules)` against authentic DOM trees:

```typescript
import { CSSStyleSheet, getCascadedStyle } from 'cssomnom';

// Load both stylesheets
const beforeSheet = new CSSStyleSheet();
beforeSheet.replaceSync(originalCss);

const afterSheet = new CSSStyleSheet();
afterSheet.replaceSync(modularizedCss);

// Sample representative DOM elements from application fixtures
function sampleElementEquivalence(element: HTMLElement) {
  const beforeStyle = getCascadedStyle(element, beforeSheet.cssRules);
  const afterStyle = getCascadedStyle(element, afterSheet.cssRules);

  const diffs: string[] = [];
  const allProps = new Set<string>();

  for (let i = 0; i < beforeStyle.length; i++) allProps.add(beforeStyle.item(i));
  for (let i = 0; i < afterStyle.length; i++) allProps.add(afterStyle.item(i));

  for (const prop of allProps) {
    const bVal = beforeStyle.getPropertyValue(prop);
    const aVal = afterStyle.getPropertyValue(prop);
    if (bVal !== aVal) {
      diffs.push(`Property '${prop}' differs on <${element.tagName.toLowerCase()} class="${element.className}">: '${bVal}' vs '${aVal}'`);
    }
  }

  return diffs;
}
```

---

## 3. Agent Execution Playbook

When tasked with a bulk CSS operation:

1. **Baseline Invariant Capture**:
   - Parse all source CSS files before making any edits.
   - Record total rule count, at-rule count, and unique selector set.
2. **Execute File Operations**:
   - Create modular files or apply transformations.
   - If splitting files, write standard ES module imports or CSS `@import` entry points as needed.
3. **Run AST Difference Verification**:
   - Concatenate or bundle the new files into an aggregate in-memory string.
   - Run the Level 1 `verifyStylesheetParity` script.
   - If missing declarations or syntax errors are reported, inspect the exact failure line and repair.
4. **Inspect Source Order & Cascade**:
   - Check if any identical-specificity rules have been reversed across separate files.
   - If necessary, adjust file import order in the entry point stylesheet.
5. **Commit Cleanly**:
   - Run `pnpm run preflight` to ensure no repository regressions.
   - Commit the refactor with a crisp, descriptive message (e.g. `css: split monolithic styles.css into modular domain stylesheets`).
