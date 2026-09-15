# WPT Conformance Backlog Survey & Investigation Notes

**Baseline Commit**: `88ea423` — **20,202 / 22,494 (89.81% raw)**  
**Spec Breakdown**:
- `css-typed-om`: 12,135 / 12,765
- `cssom`: 1,989 / 2,141
- `css-syntax`: 406 / 407
- `css-nesting`: 117 / 117
- `css-variables`: 411 / 499
- `selectors`: 4,328 / 5,654
- `mediaqueries`: 412 / 417
- `css-cascade`: 404 / 494

---

## Detailed Investigation Clusters

### B1. `offsetWidth` ignores cascaded style (Verified, ~38 subtests)
- **Location**: `tests/dom-shim/src/dom-stubs.ts:1750-1768`
- **Mechanism**: `offsetHeight` consults `getCascadedStyle(this).getPropertyValue('height')`; `offsetWidth` only reads inline `style.width`. Mirroring the `offsetHeight` branch fixes this.
- **Impact**: 42 files in `css/selectors/i18n/css3-selectors-lang-*.html` (non-contiguous, numbered to 056), baseline 0/42. Simulated fix: 38 pass, 4 fail.
- **Stragglers**: The 4 stragglers (`lang-024`, `lang-035`, `lang-044`, `lang-055`) fail because `src/matcher.ts` lacks HTML case-insensitive attribute-value matching (`lang="ES"` vs `[lang="es"]`).
- **Context**: These tests use `offsetWidth` purely as a binary oracle for "did the selector match" (`#box:lang(es) { width: 100px }` + `assert_equals(box.offsetWidth, 100)`). Closing this closes a shim gap without faking layout.

### B2. Typed OM `getDummyStyle()` caches an empty stub (Surveyed, ~157 claimed)
- **Location**: `src/typed-om/style-map/style-validation.ts:154`
- **Mechanism**: Checks `typeof globalThis.document === 'undefined'`, which in pure Node is true at import time, permanently caching `{ getPropertyValue() { return ''; } }`. `shouldWrapInCalc()` can therefore never return true; negative values on non-negative-syntax properties are set raw, LinkeDOM rejects them, and the property ends `undefined`, failing `assert_true(specifiedResult instanceof CSSStyleValue)` (~112 claimed).
- **Secondary**: Unitless zero in transform parsers (`translateX(0)`, `rotateX(0)`, `skew(0,0)`, `perspective(0)`) not rectified to `0px`/`0deg`, so constructors throw and 6 globals stay undefined → ~45 `ReferenceError` subtests in `css-typed-om/idlharness.html`.

### B3. iframes never load their `src` (Verified mechanism, estimated net 320–395)
- **Location**: `tests/dom-shim/src/iframe-runner.ts:374-428`
- **Mechanism**: `setupIframePrototype` registers `contentDocument`, `contentWindow`, `srcdoc` but no `src` getter/setter; `contentDocument` unconditionally parses a blank document, so `resources/syntax-quirks.html`, `syntax-xml.xhtml`, `semantics-quirks.html`, `semantics-xml.xhtml` never load.
- **Nuances**:
  1. 216 subtests in `semantics.html` currently pass spuriously because `nomatch` tests assert `querySelector(s) === null` (trivially true in an empty document).
  2. 120 failures in `syntax.html` are permanent even with perfect iframe loading (the 40 standards-mode failures repeat ×3 across modes).
  3. `src/matcher.ts` has no `document.contentType === 'application/xhtml+xml'` branch for XML attribute-name case-sensitivity.
  - In-memory simulation: `syntax.html` 236 → 408, `semantics.html` 513 → 702.

### B4. `:has()` multi-compound relative combinators (Surveyed, ~102 claimed)
- **Location**: `src/matcher.ts:787-815`
- **Mechanism**: `matchHasPseudo` passes intermediate sibling/child directly to `matchComplexSelector`, which matches right-to-left against the rightmost compound. Any `:has()` combining a relative combinator with multiple compounds fails: `:has(~ div .test)`, `:has(> .a > .b)`, `:has(+ div [test_attr])`.

### B5. Feasibility classifier accuracy (Verified)
- **Location**: `scripts/wpt/node/core/classifier.ts`
- **False browser-only**: Lines 120-129 classify any failure in a path containing `focus-visible` as `HARDWARE_INPUT_DRIVER`, masking selector-parsing bugs (`@supports selector(:focus-visible)`, `:not(:focus-visible)`). Lines 131-140 do the same for any file with `active-` plus `button` or `display-none`.
- **False feasible**: Lines 248-263 gate layout heuristics on `px`, but `clientWidth` yields bare integers; `checkLayout`, `clientWidth`, `clientHeight` are not recognized keywords.

### Non-Actionable Clusters
- **mediaqueries**: All 5 remaining failures are `preferences-*.tentative.https.html` requiring `navigator.preferences.*` via `test_driver.set_permission` (100% infeasible; 412/412 of remainder passes).
- **cssom**: 21 browser-only tests (`caretRangeFromPoint` / `caretPositionFromPoint`) are correctly classified as `VIEWPORT_GEOMETRY`.

### One-Off Candidates
- **css-syntax**: `escaped-eof.html` — `\` at EOF inside a hash token becomes `\uFFFD`, making it an ID token.
- **css-cascade**: 12 failures in `layer-basic.html` (nested sub-layer ordering); 16 more are misclassified layout tests.

---

## Historical Field Notes & Lessons Learned

### 1. Reconcile headline numbers against their components
Commit `699040c` was reported net-zero on the strength of two green idlharness files and was actually −142 subtests overall. It was caught only because +233 on two files didn't reconcile with +97 overall. A green local unit-test run is not evidence a change is conformance-neutral.

### 2. Spec-fidelity commits can still introduce leniency
Commit `94a11f4` quoted CSS Typed OM Level 1 § 3.2 correctly — *"a direct CSSStyleValue … with a non-null [[associatedProperty]] slot matches the grammar … regardless of what it is"* — but implemented `_associatedProperty === null || … === propKey`, granting the exemption to null slots too. Probing the widened path directly caught the bug before shipping.

### 3. WPT assertion shims fidelity
A function-by-function audit against upstream `testharness.js` verified that local assertion shims in `tests/dom-shim/src/wpt-assertions.ts` are faithful and do not artificially inflate scores. The only deliberate deviation is the cross-realm `DOMException` constructor name fallback in `assert_throws_dom`.
