# Project Plan: cssomnom, the Modern CSSOM Parser

Objective: Create a modern, spec-compliant, pure JavaScript CSSOM parser, leveraging AI assistance guided by strong conformance suites.

Completed phases 1–125 live in [PLAN.archive.md](./PLAN.archive.md). Every ~20 phases, move older completed phases there, keeping a buffer of recently completed phases here.

## Phase 126: Rule Hierarchy Cohesion & Typed OM Host Environment Cleanup [x]
**Goal**: Eliminate remaining double casts between low-level CSS Syntax AST `Rule` and high-level `CSSRule`, and clean up Typed OM global reflection hacks.

### Tasks
- [x] **Unify Grouping Rule Children & Parser Hooks**:
  - Cleanly type `CSSScopeRule`, `CSSGroupingRule`, and `childRules` to accept a unified `RuleLike = Rule | CSSRule | Declaration` union rather than forcing `as unknown as Rule[]`.
  - Refactor `ParseHooks.consumeRule` and related hooks to avoid double casting.
- [x] **Clean up Host Environment Global Reflection in Typed OM**:
  - Provide a typed host constructor accessor in `src/typed-om/utils/` instead of repeatedly casting `(globalThis as unknown as Record<string, unknown>)`.
  - Clean up type predicates in `src/typed-om/utils/type-guards.ts` and `validation.ts`.
- [x] **Gatekeeper Review & Verification**:
  - Run full `pnpm run preflight`.
  - Spawn `grizz` subagent to perform a thorough code taste and type design review across all three phases.

---

## Phase 127: Cross-Browser Vendor Pseudo Support (`allowVendorPseudos`)
**Goal**: Support cross-browser stylesheet analysis and prevent silent dropping of vendor-prefixed pseudo-classes/elements (such as `:-moz-ui-invalid`, `:-ms-input-placeholder`, `::-moz-selection`) via a first-class `allowVendorPseudos` parser option while maintaining strict W3C Selectors 4 Appendix B conformance by default.

### Tasks
- [x] **Define Option in Parser & Selector Parser Interfaces**:
  - Add `allowVendorPseudos?: boolean` to `ParserOptions` in `src/parser.ts` and `SelectorParserOptions` in `src/SelectorParser.ts`.
  - Propagate `allowVendorPseudos` through `parse(css, options?)`, `Parser.parseSelectorAST(text, options?)`, and `consumeQualifiedRule`.
- [x] **Implement Vendor Prefix Recognition in `SelectorParser`**:
  - In `src/SelectorParser.ts`: When `this.allowVendorPseudos` is enabled, permit vendor-prefixed pseudo-classes and pseudo-elements (`-moz-`, `-ms-`, `-o-`, `-webkit-`, or generic `^-[a-z0-9]+-`) without throwing `SyntaxError`.
  - Preserve strict Appendix B behavior by default (`allowVendorPseudos: false` or omitted), where only `::-webkit-*` pseudo-elements and `:-webkit-autofill` are permitted as quirks.
- [x] **Unit Tests & Preflight**:
  - Author regression unit tests in `tests/pseudo-validation.test.ts` verifying that `:-moz-ui-invalid`, `:-ms-input-placeholder`, and `::-moz-selection` survive into `cssRules` when `allowVendorPseudos: true`, and are discarded under strict mode.
  - Run `pnpm run preflight`.

---

## Phase 128: Stdout Pipe Stream Flush Hardening & WPT Flakiness Resolution
**Goal**: Resolve intermittent dropped test counts and variance in parallel WPT runs caused by asynchronous pipe stream buffer truncation on `process.exit()`.

### Tasks
- [x] **Empirically Isolate Root Cause of Runner Variance**:
  - Identified that in Node.js on POSIX, stdout writes to an OS pipe (via `execFile`) are asynchronous.
  - `scripts/wpt/node/run.ts` called `console.log` followed immediately by `process.exit(code)`, which terminated the worker before pending output chunks in the stream buffer were drained to the parent.
  - Missing `Summary: P/T passed` lines caused the parser to fall back to counting static HTML declarations, dropping 173 loop-generated subtests from both numerator and denominator in concurrent runs.
- [x] **Implement Asynchronous Stdio Draining (`flushAndExit`)**:
  - In `scripts/wpt/node/run.ts`: Implemented `flushAndExit(code: number)` that awaits `drain` events and write callbacks on `process.stdout` and `process.stderr` before exiting via `setImmediate()`.
  - Added global `uncaughtException` and `unhandledRejection` hooks that flush stdio before exit.
  - In `scripts/wpt/node/core/parser.ts`: Hardened error-state parsing so `loadError` is explicitly recorded instead of assuming partial outputs represent the full test count when a process crashes without a summary.
- [x] **Eliminate Boilerplate via Natural Node.js Event Loop Exit**:
  - Replaced manual stream draining and `flushAndExit()` helper (deleting 50+ lines of code) by simply letting Node.js exit naturally via `process.exitCode = failed > 0 ? 1 : 0`.
  - Node.js automatically drains all standard I/O pipes on natural exit when the event loop is exhausted, completely eliminating the race condition with zero wrapper logic.
  - Stress tested 100 concurrent executions with 0 anomalies, followed by a full 1,768-file WPT suite run confirming 100% stability.

---

## Phase 129: Sizing Property Validation & DOM ActiveElement Spec Alignment [x]
**Goal**: Reject negative lengths/percentages/numbers on non-negative CSS sizing and box properties in CSSStyleDeclaration and align `document.activeElement` with HTML Standard § 7.4.2.

**Spec References**:
- CSS Sizing 3: § 5.1 (`#propdef-width`), § 5.2 (`#propdef-height`), § 5.3 (`#propdef-min-width`), § 5.4 (`#propdef-max-width`)
- CSS Box Model 3: § 4 (`#padding-physical`)
- CSS Backgrounds and Borders 3: § 4.3 (`#border-width`), § 5.1 (`#border-radius`)
- CSS Values and Units 4: § 10.10 (`#range-checking`)
- CSSOM 1: § 6.7.1 (`#set-a-css-declaration`)
- HTML Standard: § 7.4.2 (`#dom-document-activeelement`)
- CSS Selectors 4: § 9.3 (`#the-focus-pseudo`), § 9.4 (`#the-focus-visible-pseudo`), § 9.5 (`#the-focus-within-pseudo`)

### Tasks
- [x] **Reject Negative Sizing & Box Values in Property Value Validation (`src/typed-om/values/style-value-parser.ts`)**:
  - Implemented `isNonNegativeProperty(prop)` identifying sizing (`width`, `height`, `*-width`, `*-height`, `*-size`, `column-width`), box padding (`padding*`, `scroll-padding*`), border width/radii (`border*`, `*-radius`), gaps (`gap`, `*-gap`), and SVG radii (`r`, `rx`, `ry`).
  - In `ParseHooks.validatePropertyValue`: Rejected negative dimension, percentage, and number tokens on non-negative properties so `style.width = "-100px"` is a silent no-op.
  - In `CSSStyleDeclaration.setProperty`: Validated properties prior to shorthand expansion and validated all expanded longhands atomically prior to applying changes.
  - In `src/shorthands.ts`: Disallowed negative lengths/percentages in `isValidLengthOrPercentage`, `expandBox`, and `expandTwoValue` for non-negative box properties (`padding`, `scroll-padding`, `border-*-width`).
  - Verified WPT `css/cssom/cssstyledeclaration-mutationrecord-002.html` and `005.html` pass 100% without spurious MutationRecord notifications.
- [x] **Align `document.activeElement` with HTML Standard § 7.4.2 (`tests/dom-shim/src/dom-stubs.ts`)**:
  - Defined `activeElement` getter and setter on `Document.prototype` per HTML Standard § 7.4.2, returning the focused element if one is focused, or falling back to `this.body ?? this.documentElement ?? null`.
  - Updated `HTMLElement.prototype.focus()` and `blur()` to track `_focusedElement` and properly clear it on blur without firing unintended events on `body`.
  - Updated `:focus`, `:focus-visible`, and `:focus-within` matchers in `src/matcher.ts` to prioritize `_focusedElement` so `body` does not match `:focus` unless explicitly focused.
  - Updated autofocus initialization in `dom-stubs.ts` and `testharness-bridge.ts`.
  - Verified `focus-visible-script-focus-003.tentative.html`, `007.tentative.html`, `009.html`, and `011.html` execute cleanly without throwing `TypeError: Cannot read properties of undefined (reading 'blur')`.
- [x] **Unit Tests & Preflight**:
  - Created `tests/style-declaration-negative-sizing.test.ts` verifying negative length rejection across sizing, box, and SVG properties, preserving negative lengths for margin/top/left, and verifying no MutationRecords are queued.
  - Updated `tests/dom-shim/tests/dom-stubs.test.ts` to verify `activeElement` defaults to `body` before focus and falls back to `body` after blur.
  - Preflight verification: `pnpm run preflight` 100% clean (0 TypeScript type errors, 0 linter warnings, all tests passing).

---

## Phase 130: WebIDL Entry Points Conformance for Typed OM [x]
**Goal**: Accept WebIDL interface objects in WPT harness assertions, and align `CSSStyleRule.styleMap`, `Element.prototype.computedStyleMap()`, and `attributeStyleMap` with WebIDL property-descriptor and prototype location requirements.

**Spec References**:
- CSS Typed OM: § 2.3 (`#declared-stylepropertymap-objects`), § 2.2 (`#computed-stylepropertymapreadonly-objects`)
- CSSOM 1: § 6.8 (`#the-elementcssinlinestyle-mixin`)
- WebIDL: § 3.6 (`#es-attributes`), § 3.7 (`#es-operations`), § 3.6.3 (`#interface-prototype-object`)

### Tasks
- [x] **WPT Harness WebIDL Interface Object Assertion Guard (`c366afd`)**:
  - `assert_own_property` and `assert_not_own_property` in `tests/dom-shim/src/wpt-assertions.ts` guarded on `typeof object === 'object'`, but WebIDL interface objects are functions.
  - `idlharness.js` calls `assert_own_property(Interface, "prototype")` for every interface member, so every interface conformance check failed with "target must be an object".
  - Upstream `testharness.js` applies no typeof guard at all; aligned by accepting functions as well as objects (`typeof object === 'object' || typeof object === 'function'`).
  - Added regression test in `tests/dom-shim/tests/wpt-assertions.test.ts`, verified red by stashing the source fix.
  - Conformance impact: +244 subtests across the suite (19,346 -> 19,590; `css-typed-om/idlharness.html` 119/544 -> 291/544).
  - Note: This commit touched only `tests/dom-shim/` and went unmeasured by the pre-commit hook at the time (which only triggered on `^src/`), misattributing the +244 gain to `d480059` until retroactively measured and inserted into `wpt-progress.md`.
- [x] **CSSStyleRule.prototype.styleMap Interface Attribute (`src/CSSOM.ts`)**:
  - Replaced own instance property initialization with an enumerable prototype getter on `CSSStyleRule.prototype` with brand check throwing `TypeError` on invalid `this`.
  - Cached `StylePropertyMap` lazily per instance (`[SameObject]`).
- [x] **Element.prototype.computedStyleMap Descriptor (`tests/dom-shim/src/dom-stubs.ts`)**:
  - Updated descriptor to `{ writable: true, enumerable: true, configurable: true, value }` per WebIDL regular operations.
  - Added brand check throwing `TypeError` if `this` is not an `Element`.
- [x] **attributeStyleMap Prototype Location & Descriptors (`tests/dom-shim/src/dom-stubs.ts`)**:
  - Moved `attributeStyleMap` from `Element.prototype` to `HTMLElement.prototype` and `SVGElement.prototype` per the `ElementCSSInlineStyle` mixin specification.
  - Configured `{ enumerable: true, configurable: true, get }` with brand checks throwing `TypeError` on incorrect `this`.
  - Reconciled `SVGElement.prototype.constructor` to point to `SVGElement` per WebIDL § 3.6.3.
  - Justified out-of-scope decision for `MathMLElement` (non-existent in LinkeDOM; avoiding fake mocks).
- [x] **Verification & Preflight**:
  - Added regression unit tests in `tests/dom-shim/tests/wpt-assertions.test.ts` and `tests/typed-om-entrypoints-webidl.test.ts`.
  - Verified `pnpm run preflight` exits 0 (clean lint, typecheck, safe-exec, unit tests).
  - WPT `css/css-typed-om/idlharness.html` increased from 119/544 to 291/544 (+172 via `c366afd`), to 335/544 (+44 via `d480059`), to 339/544 (+4 passes via `a957ca8`).
  - WPT `css/cssom/idlharness.html` gained +60 subtests via `c366afd` (maintained at 117/497 passed).
  - Spot-checked non-idlharness tests `the-stylepropertymap/declared/declared.tentative.html` (4/7), `inline/clear.html` (3/3), and `inline/get.html` (7/7).

---

## Phase 131: DOM Interface Constructor Wiring Regression, Revert & Flake Removal [x]
**Goal**: Account for attempted WebIDL § 3.6.3 constructor wiring on LinkeDOM prototypes, document the load-bearing internal constructor dependency and revert, and eliminate wall-clock flake in VirtualClock tests.

**Spec References**:
- WebIDL: § 3.6.3 (`#interface-prototype-object`)
- DOM Standard: § 4.4 (`#dom-node-clonenode`)

### Tasks
- [x] **Attempt WebIDL Constructor Wiring Repair (`699040c`)**:
  - Repointed `X.prototype.constructor` at LinkeDOM's window-exposed interface objects across 12 DOM interfaces (`Attr`, `CharacterData`, `Comment`, `Document`, `DocumentFragment`, `DocumentType`, `Element`, `HTMLElement`, `Node`, `ShadowRoot`, `SVGElement`, `Text`) to satisfy WebIDL § 3.6.3.
  - Targeted fixing WPT sandbox constructor detection (`val.prototype.constructor !== val`) in `scripts/wpt/node/run.ts`.
- [x] **Revert Constructor Wiring to Restore LinkeDOM Cloning (`71b6700`)**:
  - Reverted `699040c` after identifying that LinkeDOM's window-exposed interface objects are throw-on-construct facades sharing the internal class prototype (`DocumentFragment.prototype = _DocumentFragment.prototype`).
  - LinkeDOM's internal `cloneNode` relies on `const {ownerDocument, constructor} = this; new constructor(ownerDocument)`. Repointing `prototype.constructor` at the facade caused internal cloning to throw `TypeError: Illegal constructor`.
  - Regression cost 142 `css-cascade` subtests (400/497 -> 258/501) because every `@scope` test clones a fragment. Net negative on balance; recorded as attempted-and-reverted with the rationale rather than a gap to retry.
  - Added regression guard test in `tests/dom-shim/tests/dom-stubs.test.ts` verifying shallow/deep fragment cloning and element cloning succeed, preventing silent reintroduction.
- [x] **Eliminate Wall-Clock Flake in `VirtualClock.pumpUntil` (`d7752b4`)**:
  - Scaled virtual interval and timeout durations 1000x (10ms/50ms -> 10s/50s) in `tests/dom-shim/tests/virtual-clock.test.ts` to widen wall-clock assertion margin from 2x (<20ms) to ~50x (<1000ms), removing intermittent flakes under parallel suite load without altering test semantics.

---

## Phase 132: WPT Harness VM Realm Eval Isolation & Pre-Commit Measurement Hook [x]
**Goal**: Stop host-realm `eval` from shadowing the VM context realm in the WPT runner, resolving `idlharness.js` `ReferenceError`s across test objects, and track the pre-commit conformance measurement hook in version control.

**Spec References**:
- ECMA-262: § 19.2.1 (`#sec-eval-x`)

### Tasks
- [x] **Stop Host-Realm `eval` Shadowing VM Context in WPT Sandbox (`c69eb49`)**:
  - Identified that `runWptFile` bulk-copied own properties from LinkeDOM's `window` into the VM context sandbox, copying the host realm's `eval`.
  - Per ECMA-262 § 19.2.1, a call is only a direct eval when the callee is the current realm's `%eval%`. A foreign realm's eval degrades to an indirect eval in the host global scope, leaving test-scope identifiers inaccessible.
  - Upstream `idlharness.js` `test_object()` executes `obj = eval(desc)`, so every `add_objects` entry threw `ReferenceError`.
  - Added `'eval'` to `JS_INTRINSICS` in `scripts/wpt/node/run.ts` to preserve context-realm `eval`.
  - Conformance gain: +235 passing subtests (`css/cssom/idlharness.html` 117/497 -> 281/484, `css/css-typed-om/idlharness.html` 339/544 -> 408/539; overall 19,638 -> 19,873).
  - Denominator impact: Denominators shrank by 21 total because upstream idlharness skips its `must be primary interface of` subtest for cross-realm objects (`obj instanceof Object === false` for host-realm CSSOM objects in VM context) — verified empirically, not an exclusion introduced locally.
- [x] **Track Pre-Commit Hook & Broaden Result-Affecting Triggers (`82ba1dd`)**:
  - Moved untracked `.git/hooks/pre-commit` into version-controlled `.githooks/pre-commit` activated via npm `prepare` script (`git config core.hooksPath .githooks`).
  - Broadened `RESULT_AFFECTING` commit trigger from `^src/` to `^(src/|tests/dom-shim/src/|scripts/wpt/node/|tests/wpt-node-config\.json$|pnpm-lock\.yaml$)` so DOM shim, runner, and config changes are measured upon commit instead of being misattributed.
  - Automated staging of regenerated `wpt-progress.md` and `README.md` when metrics change.

---

## Phase 133: Spec-Wide WebIDL Prototype Descriptors & Review Remediation [x]
**Goal**: Align CSSOM and DOM shim interface prototype descriptors, attribute accessors, and operations with WebIDL specification requirements and remediate review findings.

**Spec References**:
- WebIDL: § 3.6 (`#es-attributes`), § 3.6.1 (`#es-attribute-getter`), § 3.6.2 (`#es-attribute-setter`), § 3.6.3 (`#interface-prototype-object`), § 3.6.4 (`#es-constants`), § 3.6.5 (`#constants-on-interface-prototype-object`), § 3.7 (`#es-operations`)
- CSSOM 1: § 6.5 (`#the-cssrule-interface`), § 6.5.1 (`#the-cssstylerule-interface`), § 6.7 (`#the-cssstyledeclaration-interface`), § 6.8 (`#the-elementcssinlinestyle-mixin`)

### Tasks
- [x] **WebIDL Interface Prototype Descriptors & Brand Checks (`eea136a`)**:
  - Created `src/webidl.ts` with `applyWebIDLInterface` and `applyWebIDLConstants`.
  - Configured prototype attributes as `{ enumerable: true, configurable: true, get, set }` with brand checks throwing `TypeError` on invalid receiver or when called on the prototype itself (WebIDL § 3.6.1, § 3.6.2).
  - Configured prototype operations as `{ writable: true, enumerable: true, configurable: true, value }` with brand checks and arity checks throwing `TypeError` when called with fewer arguments than required (WebIDL § 3.7).
  - Configured constants as `{ writable: false, enumerable: true, configurable: false }` on interface objects and prototypes (WebIDL § 3.6.4, § 3.6.5).
  - Applied across core CSSOM classes (`CSSRule`, `CSSStyleRule`, `CSSGroupingRule`, `CSSMediaRule`, `CSSPageRule`, `CSSNamespaceRule`, `CSSMarginRule`, `CSSImportRule`, `CSSNestedDeclarations`, `CSSStyleSheet`, `CSSRuleList`, `MediaList`, `StyleSheetList`) and DOM shim prototypes in `tests/dom-shim/src/dom-stubs.ts`.
  - Updated property accessors codegen in `scripts/codegen/generate_properties.ts` and `src/data/gen/properties.ts` to generate enumerable and configurable descriptors.
  - Added unit test suite in `tests/cssom-webidl-descriptors.test.ts`.
- [x] **WebIDL Review Remediation & API Surface Hardening (`1e268e2`)**:
  - Added idempotency guard (`appliedCtors` WeakSet) in `src/webidl.ts` to prevent double-wrapping prototype properties.
  - Added `interfaceName` option for clean error messages and `exclude` option for internal properties.
  - Added `rejectOperations` option supporting async operations (e.g. `CSSStyleSheet.prototype.replace`) to return rejected promises rather than throwing synchronously on brand/arity failure.
  - Added `applyWebIDLPrototypeDescriptors(ctor)` for light enumerability enforcement.
  - Removed duplicate `applyWebIDLInterface` in `src/typed-om/utils/webidl.ts`, unifying logic in `src/webidl.ts`.
  - Enforced API surface boundaries in `tests/api-surface.test.ts` ensuring WebIDL utility helpers are not exposed on the public package entry point.
- [x] **Verification & Conformance**:
  - Conformance moved 19,638/22,517 (87.2%) -> 20,020/22,494 (89.0%) over this span.
  - `pnpm run preflight` passes cleanly: 0 type errors, 0 lint warnings, safe-exec guard clean, and all 4,166 unit tests passing.

---

## Phase 134: Typed OM Color Reification Spec Compliance & Cross-Realm Assertion Documentation [x]
**Goal**: Realign Typed OM color property reification with the normative per-property rules in CSS Typed OM Level 1 § 7.2 (#reify-property) and § 7.1 (#reify-failure) by returning generic base `CSSStyleValue` instead of `CSSColorValue` or `CSSKeywordValue` (except for `currentcolor` and property-specific non-color keywords), and document the cross-realm DOMException escape hatch in the WPT test harness.

**Spec References**:
- CSS Typed OM 1: `submodules/css-houdini-drafts/css-typed-om/Overview.bs`
  - § 3.2 The StylePropertyMap (`#dom-stylepropertymap-set`)
  - § 6.1 CSSColorValue (`#dom-csscolorvalue-parse`, lines 3085-3098)
  - § 7.1 Unrepresentable Values (`#reify-failure`, lines 5296-5315)
  - § 7.2 Property-specific Rules (`#reify-property`, lines 3622+)
  - § 7.5 `<color>` Values (`#reify-color`, lines 5540-5545, 5548)
- WPT testharness: `submodules/web-platform-tests/resources/testharness.js` (lines 2300-2447, line 2441)

### Tasks
- [x] **Typed OM Color Property Reification (`src/typed-om/values/style-value-parser.ts`, `src/typed-om/style-map/style-validation.ts`)**:
  - Replaced property reification delegation to `CSSColorValue.parse()` with base `CSSStyleValue` construction per CSS Typed OM Level 1 § 7.2 table (e.g. lines 4105, 4078, 4013, 4745, 3752) and § 7.1 (#reify-failure).
  - Preserved static `CSSColorValue.parse()` algorithm for `CSSRGB`/`CSSColorValue` subclasses per § 6.1.
  - Reserved `CSSKeywordValue` identifier reification strictly for `currentcolor` and syntax-permitted non-color keywords (`auto` for `caret-color`/`accent-color`, `none` for `fill`/`stroke`), reifying named colors (`red`, `black`, etc.) and `transparent` as base `CSSStyleValue`.
  - Added full spec conflict documentation explaining why the normative per-property table at #reify-property takes precedence over unreferenced prose in § 7.5.
  - Extended `COLOR_PROPERTIES` to encompass all longhand color properties (`accent-color`, `fill-color`, `flood-color`, `lighting-color`, `stop-color`, `text-emphasis-color`).
  - Permitted direct associated `CSSStyleValue`s in `validateValuesForProperty` without re-parsing per § 3.2.
  - Cleaned up redundant `CSSColorValue` unwrapping helper in `tests/polyfill-compat/parser-compat.ts`.
  - Added pure unit tests in `tests/typed-om-color-reification.test.ts` and updated assertions in `tests/typed-om-colors.test.ts` and `tests/typed-om-syntax.test.ts`.
  - Closed leniency hole in `validateValuesForProperty` (`src/typed-om/style-map/style-validation.ts`) by requiring a non-null `_associatedProperty` matching `propKey` per CSS Typed OM Level 1 § 3.2, ensuring direct `CSSStyleValue`s with null slots and invalid grammar throw `TypeError`.
  - Separated citation comment in `src/typed-om/values/style-value-parser.ts` into distinct claims: literal table behavior (only `currentcolor` reifies as identifier) vs deliberate alignment with Chromium and WPT (`caret-color.html`) for property-specific grammar keywords.
- [x] **Cross-Realm DOMException Assertion Documentation (`tests/dom-shim/src/wpt-assertions.ts`)**:
  - Documented cross-realm `assert_throws_dom` leniency fallback in `tests/dom-shim/src/wpt-assertions.ts:611-616` against upstream `submodules/web-platform-tests/resources/testharness.js:2441`.
  - Explicitly recorded why host-vs-VM realm divergence necessitates constructor name matching, and transparently noted that wrong-global throw detection cannot fail under this harness.

---

## Phase 135: DOM Stub Cascaded Style Resolution for `offsetWidth` [x]
**Goal**: Resolve `offsetWidth` against element cascaded style in `tests/dom-shim/src/dom-stubs.ts` to mirror `offsetHeight` behavior for selector matching assertions.

### Tasks
- [x] **Align `offsetWidth` with `offsetHeight`**: Update `offsetWidth` getter in `tests/dom-shim/src/dom-stubs.ts:1750-1768` to read `getCascadedStyle(this).getPropertyValue('width')` instead of only inspecting inline `style.width`.
- [x] **Verify WPT Selector Suite**: Validate pass rate progression across `css/selectors/i18n/css3-selectors-lang-*.html`. (Improved pass rate from 0/42 to 16/42, with 100% on `css3-selectors-lang-001.html`).

---

## Phase 136: Typed OM Module-Load Document Cache & Transform Unitless Zero [x]
**Goal**: Eliminate static module-load environment caching in `style-validation.ts` and handle unitless zero in transform component parsers.

### Tasks
- [x] **Dynamic Document Resolution in `getDummyStyle()`**: In `src/typed-om/style-map/style-validation.ts`, dynamically resolve document access with `CSSStyleDeclaration` probe fallback instead of caching an empty stub at import time.
- [x] **Rectify Unitless Zero in Transform Parsers**: Support unitless zero (`0` -> `0px`/`0deg`) in transform function parsers (`translateX`, `rotateX`, `skew`, `perspective`) per CSS Values 4 § 6.2 and CSS Transforms 2 § 2.
- [x] **Verify WPT Typed OM Suite**: Validate conformance gains across `numeric-factory.tentative.html`, `transform.html`, `transformvalue-normalization.tentative.html`, and `idlharness.html`.

---

## Phase 137: WPT Sandbox Iframe Resource Loading (`iframe.src`) [x]
**Goal**: Implement `src` loading on HTML iframe stubs in the WPT runner sandbox to correctly evaluate multi-frame tests.

### Tasks
- [x] **Support `src` Property on HTMLIFrameElement**: In `tests/dom-shim/src/iframe-runner.ts`, add `src` getter/setter to load referenced resources into `contentDocument`.
- [x] **Handle XHTML Content Type**: Support `document.contentType === 'application/xhtml+xml'` in `src/matcher.ts` for XML case sensitivity.
- [x] **Verify Multi-Frame WPT Tests**: Validate `syntax.html` and `semantics.html` test suites.

---

## Phase 138: Complex Relative Combinators in `:has()` Pseudo-Class [x]
**Goal**: Verify and harden matching of multi-compound relative combinators in `:has()` selectors.

### Tasks
- [x] **Audit `matchHasPseudo` Compound Traversal**: In `src/matcher.ts:794-835`, verify multi-compound relative selectors (e.g. `:has(~ div .test)`, `:has(> .a > .b)`).
- [x] **Unit Tests & WPT Validation**: Add comprehensive unit tests covering complex nested and chained relative combinators in `:has()`.

---

## Phase 139: WPT Feasibility Classifier Accuracy Tuning [x]
**Goal**: Eliminate false browser-only and false feasible classifications in `scripts/wpt/node/core/classifier.ts`.

### Tasks
- [x] **Refine Browser-Only Heuristics**: Restrict `focus-visible` and `active-` classifications to prevent masking pure selector parsing bugs.
- [x] **Refine Feasible Layout Heuristics**: Correctly identify integer `clientWidth`/`clientHeight` checks and `check-layout-th.js` tests as layout dependencies.

---

## Phase 140: WPT Conformance Boost — CSS Variables Spec Compliance & Cycle Invalidation [x]
**Goal**: Advance `css-variables` conformance from 411 / 499 (82.4%) to 471+ / 494 (95.3%+ feasible) by fixing declaration-value pre-validation, registered property CSS-wide keywords, guaranteed-invalid cascade invalidation, replaced element math simplification, and `css-variables-2` dynamic name substitution.

**Spec References**:
- CSS Custom Properties for Cascading Variables Module Level 1: `submodules/csswg-drafts/css-variables-1/Overview.bs`
  - § 2 Custom Properties (`#defining-custom-properties`)
  - § 3 Using Cascading Variables: The `var()` Notation (`#using-variables`)
  - § 3.1 Invalid Substitution Values (`#invalid-variables`)
- CSS Values and Units Module Level 5: `submodules/csswg-drafts/css-values-5/Overview.bs`
  - § 4.1 Invalid Substitution Values (`#invalid-substitution`)
- CSS Properties and Values API Level 1: `submodules/css-houdini-drafts/css-properties-values-api/Overview.bs`
  - § 5 Calculation of Computed Values (`#calculation-of-computed-values`)
- WPT Test Suites: `submodules/web-platform-tests/css/css-variables/`

### Sub-Phases & Atomic Tasks

#### Phase 140.1: Quick Wins — Declaration Value Pre-Validation & CSS-Wide Keywords (+17 tests) [x]
- [x] **Enforce `validateDeclarationValue` in `CSSStyleDeclaration.setProperty()` (+7 tests)**:
  - In `src/CSSStyleDeclaration.ts:522-526`, `setProperty()` currently early-exits `true` whenever `var(` is present, skipping `validateDeclarationValue`.
  - Update `setProperty()` to pass parsed component values to `ParseHooks.validateDeclarationValue(compVals)` before storing.
  - Reject invalid `var()` syntaxes like `var(--x {--y})`, `var({--x} --y)`, `var()`, `var({})`, `var(, 10px)`.
  - *Target*: 100% pass on [`submodules/web-platform-tests/css/css-variables/var-parsing.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/var-parsing.html) (7/7 passing, +7 tests).
- [x] **Registered Custom Property CSS-Wide Keyword & Defaulting Resolution (+8 tests)**:
  - In `src/cascade/variable-resolver.ts:284-291`, consult `PropertyRegistry.get(name)` for custom properties:
    - If `initial`: return `def?.initialValue ?? null` (instead of returning `null` unconditionally).
    - If `unset` or `revert`: if `!def?.inherits`, resolve to `def?.initialValue ?? null`; if `def?.inherits`, inherit from parent element.
  - In `substituteVariables`: when `var(--prop)` is looked up and not present in `customProps`, check `PropertyRegistry.get(varName)?.initialValue`.
  - *Target*: 100% pass on [`submodules/web-platform-tests/css/css-variables/variable-css-wide-keywords.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-css-wide-keywords.html) (8/8 passing, +8 tests).
- [x] **Token-Aware Shadow Property Serialization (+2 tests)**:
  - In `src/cascade/computed-style.ts:296-317`, replace naive `rawVal.split(/\s+/)` with token-aware traversal using `tokenize(rawVal)`.
  - Prevent splitting across commas inside functional values like `rgb(0, 128, 0)` in `box-shadow`.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variable-substitution-shadow-properties.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-substitution-shadow-properties.html) (+2 tests).

#### Phase 140.2: Core Cascade Invalidation & Guaranteed-Invalid Propagation (+14 tests) [x]
- [x] **Guaranteed-Invalid Invalidation on Cascade Rollback (+4 tests)**:
  - In `src/cascade/variable-resolver.ts:256-260`: when a custom property declaration fails variable substitution (`subVal === null` due to cycle or referencing an unset variable without fallback), do **not** `continue` down the cascade loop to inherit or use an earlier rule!
  - Per CSS Variables 1 § 3.1, mark the property as invalid at computed-value time, storing `resolvedCustomProps.set(name, '')` (the guaranteed-invalid value) and return `null`.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variables-substitute-guaranteed-invalid.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variables-substitute-guaranteed-invalid.html) and [`variable-substitution-variable-declaration.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-substitution-variable-declaration.html) (+4 tests).
- [x] **Shorthand Invalidation at Computed-Value Time (+6 tests)**:
  - In `src/cascade/value-processor.ts:88-92`: when `expandShorthandWithVariables` encounters an invalid `var()` in a shorthand (e.g. `margin: var(--invalid)`), mark each longhand as invalid at computed-value time on that element.
  - Longhands must compute to their initial/inherited value (`0px`), overriding previous rules on the element rather than letting the cascade fall back to earlier declarations (e.g. `margin: 77px`).
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variable-substitution-shorthands.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-substitution-shorthands.html) (+6 tests).
- [x] **Pseudo-Element Restricted Properties (+4 tests)**:
  - Enforce that `position` cannot be altered by `::first-letter` / `::first-line` per CSS Pseudo-Elements 4 § 2 and always computes to `static`.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variable-first-letter.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-first-letter.html) and [`variable-first-line.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-first-line.html) (+4 tests).

#### Phase 140.3: Value Processing & Geometry Simplification (+17 tests) [x]
- [x] **`calc()` Simplification on Replaced Element Sizing (+6 tests)**:
  - In `CSSComputedStyleDeclaration.getPropertyValue('width')` and `'height'`, simplify constant `calc(...)` expressions like `calc(10px + 20px)` into `30px` using `CSSMathOperations`.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variable-substitution-replaced-size.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-substitution-replaced-size.html) (+6 tests).
- [x] **`perspective-origin` Dimension Resolution (+6 tests)**:
  - In `src/cascade/computed-style.ts`, implement resolved value computation for `perspective-origin`: resolve percentage tokens against the element's box dimensions per CSS Transforms 2 § 3.2.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variable-reference-perspective-origin.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-reference-perspective-origin.html) (+6 tests).
- [x] **SVG Presentation Attribute Default Value Alignment (+5 tests)**:
  - In `src/cascade/computed-style.ts`, update SVG-specific property default mappings for `clip`, `baseline-shift`, `flood-color`, `lighting-color`, `stop-color`, `stroke` when queried on SVG element instances.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variable-presentation-attribute.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-presentation-attribute.html) (+5 tests).

#### Phase 140.4: `css-variables-2` Dynamic Name Substitution (+12 tests) [x]
- [x] **Arbitrary Substitution Value for `var()` Name**:
  - In `src/cascade/variable-resolver.ts:100-125`, evaluate nested substitution functions in the first argument of `var()` (e.g. `var(var(--myvar))` or `var({var(--myvar)})`) recursively before validating as a custom property ident.
  - Strip outer whitespace and `{}` blocks from the substituted string.
  - If the resulting string matches `^--[a-zA-Z0-9_-]+$`, resolve that property; otherwise treat as invalid and trigger fallback.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-variables/variable-reference-name-substitution.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-reference-name-substitution.html) (+8 tests), [`variable-reference-name-substitution-attr-taint.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/variable-reference-name-substitution-attr-taint.html) (+4 tests), and [`var-ident-function.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-variables/var-ident-function.html) (+1 test).

---

## Phase 141: WPT Conformance Boost — CSS Cascade Layer Ordering & Grammar Alignment [x]
**Goal**: Advance `css-cascade` conformance from 412 / 494 (83.4%) to 462 / 462 (100% feasible, 93.5% raw) by fixing WebIDL prototypes, `@layer` grammar strictness, computed `line-height` resolution, `@scope` relative syntax serialization, implicit sub-layer sorting, and layered at-rule resolution.

**Spec References**:
- CSS Cascading and Inheritance Level 5: `submodules/csswg-drafts/css-cascade-5/Overview.bs`
  - § 6.4 Cascade Layers (`#layering`)
  - § 6.4.2 Layer Names (`#layer-names`)
  - § 6.4.3 Layer Ordering (`#layer-ordering`)
  - § 6.4.4 Declaring Layers (`#declaring-layers`)
- CSS Cascading and Inheritance Level 6: `submodules/csswg-drafts/css-cascade-6/Overview.bs`
  - § 3 Scoping (`#scoping`)
- CSSOM Level 1: `submodules/csswg-drafts/cssom-1/Overview.bs`
  - § 6.4.4.1 The `CSSLayerBlockRule` Interface
  - § 6.4.4.2 The `CSSLayerStatementRule` Interface
- WPT Test Suites: `submodules/web-platform-tests/css/css-cascade/`

### Sub-Phases & Atomic Tasks

#### Phase 141.1: Quick Wins — WebIDL Harness, @layer Grammar & Scope Syntax (+21 tests) [x]
- [x] **IDL Harness Alignment for Cascade Rules (+11 tests)**:
  - In `src/rules/at-rules.ts`:
    - `CSSLayerBlockRule`: Move `name` from instance assignment to prototype getter `get name(): string { return this._name; }`. Define `get [Symbol.toStringTag]() { return 'CSSLayerBlockRule'; }`.
    - `CSSLayerStatementRule`: Move `nameList` from instance property to prototype getter `get nameList(): readonly string[] { return this._nameList; }` returning a frozen array. Define `get [Symbol.toStringTag]() { return 'CSSLayerStatementRule'; }`.
    - `CSSScopeRule`: Define `get [Symbol.toStringTag]() { return 'CSSScopeRule'; }`.
  - In `src/webidl.ts`: Set `Object.defineProperty(ctor, 'length', { value: 0, configurable: true })` for non-constructible interface objects.
  - *Target*: 100% pass on [`submodules/web-platform-tests/css/css-cascade/idlharness.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/idlharness.html) (+11 tests).
- [x] **`@layer` Grammar Strictness Validation (+4 tests)**:
  - In `src/parser.ts:458-464` (`handleLayerRule`):
    - Block rule (`@layer <name>? { ... }`): Verify prelude has at most 1 valid `<layer-name>` without spaces around `.`. Reject comma tokens (`@layer A, B { }`).
    - Statement rule (`@layer <name>#;`): Reject empty prelude (`@layer;`). Ensure each comma-separated item strictly matches `<ident>('.'<ident>)*` without whitespace.
  - *Target*: 100% pass on [`submodules/web-platform-tests/css/css-cascade/parsing/layer.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/parsing/layer.html) (+4 tests).
- [x] **Computed `line-height` Unit Resolution (+4 tests)**:
  - In `src/cascade/computed-style.ts:331` and `tests/dom-shim/src/dom-stubs.ts:2284`, resolve relative units like `2em` or unitless multipliers by multiplying against the element's computed `font-size` (`18px * 2 = 36px`).
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-cascade/important-vs-inline-002.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/important-vs-inline-002.html) (+4 tests).
- [x] **`@scope` Relative Selector Serialization (+2 tests)**:
  - In `src/parser.ts:1690-1694` (`normalizeNestedSelector`): Check if enclosing rule context is an `@scope` rule. When inside `@scope`, preserve relative combinator syntax (`> .foo`) without prepending `& `.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-cascade/at-scope-relative-syntax.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/at-scope-relative-syntax.html) (+2 tests).

#### Phase 141.2: Layer Ordering & Cascade Precedence (+20 tests) [x]
- [x] **Implicit Sub-layer Sorting (+12 tests)**:
  - In `src/cascade/layer-manager.ts` and `src/cascade/rule-filter.ts:467`:
    - Implement `css-cascade-5 § 6.4.3`: unlayered style rules within an `@layer` block are assigned to an implicit sub-layer that is sorted **after** any explicitly nested layers.
    - Normal rules in the implicit sub-layer must win over explicit nested layers.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-cascade/layer-basic.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/layer-basic.html) (+12 tests).
- [x] **Media-Conditioned Layer Scanning (+6 tests)**:
  - In `scanLayers()`, pass the active media query environment so conditionally defined layers inside `@media` only establish layer precedence if their condition evaluates to true per `css-cascade-5 § 6.4.3`.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-cascade/layer-media-query.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/layer-media-query.html) (+6 tests).
- [x] **HTML UA Stylesheet Heading Margins (+2 tests)**:
  - In `getUaDefault()`, add default block margins for heading tags (`h1`-`h6`, `p`, `blockquote`) matching HTML rendering specifications.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-cascade/revert-val-005.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/revert-val-005.html) (+2 tests).

#### Phase 141.3: Name-Defining Rules & Shadow DOM Cascade (+9 tests) [x]
- [x] **Layered At-Rule Resolution (`@property`, `@keyframes`, `@font-face`) (+5 tests)**:
  - Associate layer metadata with `@property` and `@keyframes` registrations; resolve winning definitions according to layer precedence rather than naive first-come order.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-cascade/layer-property-override.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/layer-property-override.html), [`layer-keyframes-override.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/layer-keyframes-override.html), and [`layer-font-face-override.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/layer-font-face-override.html) (+5 tests).
- [x] **Shadow DOM `revert-rule` & `::part()` Rollback (+4 tests)**:
  - Track shadow tree origin and rule identity in `MatchedDeclaration` so `revert-rule` rolls back cleanly across `::part()` boundaries.
  - Implement cycle detection between `revert-rule !important` and `revert-layer` resolving to `unset`.
  - *Target*: Fixes [`submodules/web-platform-tests/css/css-cascade/revert-rule-shadow.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/revert-rule-shadow.html) and [`revert-rule-cycle.tentative.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/css-cascade/revert-rule-cycle.tentative.html) (+4 tests).

---

## Phase 142: WPT Conformance Boost — Core CSSOM WebIDL Harness & Dynamic Stylesheet Lifecycle [x]
**Goal**: Advance `cssom` conformance from 1,989 / 2,141 (92.9%) to 2,085 / 2,120 (98.3% feasible) by fixing test harness Promise rejection polyfills, missing DOM prototypes, `<style>` / `<link>` lifecycle synchronization, rule restrictions, and logical property setter ordering.

**Spec References**:
- CSSOM Level 1: `submodules/csswg-drafts/cssom-1/Overview.bs`
  - § 4.6 The `LinkStyle` Interface
  - § 6.4.3 The `CSSImportRule` Interface
  - § 6.5.1 The `CSSStyleDeclaration` Interface (`#dom-cssstyledeclaration-setproperty`)
  - § 6.6 The `MediaList` Interface
- WebIDL Level 1: `submodules/css-houdini-drafts/` & W3C WebIDL
- WPT Test Suites: `submodules/web-platform-tests/css/cssom/`

### Sub-Phases & Atomic Tasks

#### Phase 142.1: Test Harness WebIDL Bridge & Global Prototypes (+53 tests) [x]
- [x] **Polyfill `promise_rejects_dom` and `promise_rejects_js` on Test Harness (+25 tests)**:
  - In `tests/dom-shim/src/wpt-assertions.ts`, implement `promise_rejects_dom` and `promise_rejects_js` matching WPT `testharness.js` specifications.
  - Prevents async constructable stylesheet rejection tests (e.g. `sheet.replace('invalid')`) from crashing the harness.
  - *Target*: Unblocks constructable stylesheet rejection tests across `submodules/web-platform-tests/css/cssom/` (+25 tests).
- [x] **Expose Missing Interface Prototypes on Mock Window (+20 tests)**:
  - In `tests/dom-shim/src/dom-stubs.ts`: expose `SVGStyleElement`, `MathMLElement`, and ensure `Document.prototype` inherits `Node.prototype` with proper accessor descriptors.
  - *Target*: Fixes missing interface prototype tests in [`submodules/web-platform-tests/css/cssom/idlharness.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/cssom/idlharness.html) (+20 tests).
- [x] **Prototype Property Descriptors & Stringification (+8 tests)**:
  - In `src/rules/at-rules.ts`: ensure `CSSMediaRule.prototype.media` is a prototype getter and `CSSFontFaceRule.prototype.style` is correctly descriptor-bound with `Symbol.toStringTag`.
  - *Target*: Completes `idlharness.html` interface checks (+8 tests).

#### Phase 142.2: DOM Shim Stylesheet Lifecycle & Alternate Sheets (+18 tests) [x]
- [x] **Synchronize `<style>` and `<link>` Attributes with Properties (+4 tests)**:
  - In `tests/dom-shim/src/dom-stubs.ts:1264`, check both `el.getAttribute('media')` and `(el as HTMLStyleElement).media` property when populating stylesheet media.
  - *Target*: 100% pass on [`submodules/web-platform-tests/css/cssom/medialist-interfaces-001.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/cssom/medialist-interfaces-001.html) (+4 tests).
- [x] **Support Alternate Stylesheet State & `ownerNode` Decoupling (+14 tests)**:
  - Implement CSSOM § 4.6 alternate stylesheet disabled rules: toggling `link.disabled = true` uncouples `sheet.ownerNode = null` and clears it from `document.styleSheets`.
  - *Target*: Fixes [`submodules/web-platform-tests/css/cssom/HTMLLinkElement-disabled-002.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/cssom/HTMLLinkElement-disabled-002.html) through `007.html` (+14 tests).

#### Phase 142.3: CSSOM Rule Restrictions & Declaration Polish (+16 tests) [x]
- [x] **Enforce Property Restrictions on `@page` and `@keyframes` (+2 tests)**:
  - In `CSSPageRule` and `CSSKeyframeRule`, configure property validator hooks to drop non-applicable properties (`transform` in `@page`, `animation-name` in `@keyframes`).
  - *Target*: 100% pass on [`submodules/web-platform-tests/css/cssom/rule-restrictions.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/cssom/rule-restrictions.html) (+2 tests).
- [x] **`CSSStyleDeclaration` Logical Property Grouping (+7 tests)**:
  - In `src/CSSStyleDeclaration.ts:setProperty()`, preserve declaration ordering relative to logical property groups per CSSOM § 6.5.1.
  - *Target*: Fixes [`submodules/web-platform-tests/css/cssom/cssstyledeclaration-setter-logical.html`](file:///usr/local/google/home/paulirish/code/cssom/submodules/web-platform-tests/css/cssom/cssstyledeclaration-setter-logical.html) (+7 tests).
- [x] **Constructable Stylesheet Document Adoption Verification (+7 tests)**:
  - Implement document adoption checks when modifying constructable stylesheets and CSS Syntax 3 § 5.5.5 Step 7 declaration trailing whitespace removal.
  - *Target*: Fixes constructable stylesheet adoption and `replace()` rule tests in `submodules/web-platform-tests/css/cssom/` (+7 tests).

---

## Phase 143: Janitor Sweep — `src/parser.ts` De-accretion & Simplification [x]
**Objective**: Systematically refactor and trim `src/parser.ts` (currently 2,267 lines) to reverse historical accretion, reduce cognitive complexity, and improve code clarity aligned with `~/.gemini/TASTE.md` and the `janitor` skill.

**Context**: As the central entrypoint across 140+ feature and spec conformance phases, `src/parser.ts` has accumulated significant defensive sediment, repetitive token walkers, and sprawling at-rule branches.

**Guidelines & Invariants**:
- **Autonomy**: The Janitor agent determines the optimal refactoring strategy (e.g. extracting helper modules, consolidating loops, or simplifying dispatch tables).
- **Net-Negative Reduction**: Strive for meaningful reduction in line count and nesting depth.
- **Strict Parity**: Must maintain 100% behavioral parity with zero WPT regressions (`pnpm run wpt:verify`) and clean preflight (`pnpm run preflight`).

### Tasks
- [x] Establish characterization baseline with `pnpm run preflight` and `pnpm run wpt:verify`.
- [x] Conduct Janitor refactoring pass on `src/parser.ts` to reduce complexity and remove dead/defensive boilerplate.
- [x] Verify zero regressions across all 8 WPT suites and commit net-negative improvements.

---

## Phase 144: Janitor Sweep — `src/shorthands.ts` Simplification [x]
**Objective**: Refactor and streamline `src/shorthands.ts` (currently 2,249 lines), eliminating duplicate expansion and serialization logic while maintaining complete CSS property shorthand fidelity.

**Context**: High repetition exists across 4-sided properties (margins, paddings, borders, insets) and directional property expansions.

**Guidelines & Invariants**:
- **Autonomy**: Let the Janitor agent evaluate opportunities to unify boilerplate (parameterized helpers, declarative maps, or modern Array/Set primitives).
- **Strict Parity**: Verify zero regressions against shorthand and lightning CSS suites.

### Tasks
- [x] Establish characterization baseline with `pnpm run preflight` and existing shorthand tests.
- [x] Conduct Janitor refactoring pass on `src/shorthands.ts` to de-duplicate logic and clean up boilerplate.
- [x] Verify zero regressions across unit tests and WPT conformance suites.

---

## Phase 145: Janitor Sweep — `src/serializer.ts` & `src/MediaParser.ts` Streamlining [x]
**Objective**: Clean and simplify `src/serializer.ts` (1,249 lines) and `src/MediaParser.ts` (1,397 lines), reducing sprawling branches and modernizing token stringification.

**Context**: Both files have accumulated complex backtracking loops, duplicate string formatting routines, and legacy helpers.

**Guidelines & Invariants**:
- **Autonomy**: The Janitor agent plans and executes targeted de-accretion to clarify control flow and eliminate redundant state tracking.
- **Strict Parity**: Verify zero regressions on serialization tests and WPT `mediaqueries` suite.

### Tasks
- [x] Establish characterization baseline with `pnpm run preflight` and `pnpm run wpt --spec=mediaqueries`.
- [x] Conduct Janitor refactoring pass across `src/serializer.ts` and `src/MediaParser.ts`.
- [x] Verify zero regressions across all test suites.

---

## Phase 146: Janitor Sweep — `src/rules/at-rules.ts` Modularization [x]
**Objective**: Clean up and modularize `src/rules/at-rules.ts` (1,133 lines) to improve code organization, decouple distinct spec domain rules, and standardize WebIDL interfaces.

**Context**: Houses 15 distinct at-rule implementations in a single file with varying property descriptor patterns.

**Guidelines & Invariants**:
- **Autonomy**: The Janitor agent decides the best modular structure (e.g., partitioning into domain-focused submodules or consolidating prototype descriptors) while preserving all public and internal exports.
- **Strict Parity**: Verify zero regressions across `tests/cssom-interfaces.test.ts` and WPT `cssom` / `css-cascade` suites.

### Tasks
- [x] Establish baseline verification with `pnpm run preflight`.
- [x] Conduct Janitor refactoring pass on `src/rules/at-rules.ts`.
- [x] Verify zero regressions across all test suites and confirm export backward-compatibility.

---

## Phase 147: Architectural Cleanup — Codegen Normative HTML UA Stylesheet & Replace `getUaDefault()` [x]
**Objective**: Eliminate the accreted 130+ line imperative `getUaDefault()` `if/else` ladder in `src/cascade/value-processor.ts` and replace it with an auto-generated User-Agent stylesheet (`src/data/gen/ua-stylesheet.ts`) extracted directly from the WHATWG HTML Standard (`rendering.html`) via `scripts/codegen/generate_ua_stylesheet.ts`, wired into `scripts/codegen/generate_all.ts` and `MAINTENANCE.md`.

**Context & Rationale**:
- Currently, `getUaDefault()` manually re-implements tag matching (`if (tag === 'H1') ... else if (tag === 'H2')`), shorthand expansion (`margin`, `margin-block`, `margin-top`), and pre-multiplied `em`-to-`px` math (`21.44px`, `19.92px`, `22.176px`).
- Furthermore, per our **Automation Over Hardcoding** rule (`AGENTS.md`), spec-derived data must live in `src/data/gen/` and be updated by `pnpm run codegen` (`scripts/codegen/generate_all.ts`).
- The WHATWG HTML Standard (`https://html.spec.whatwg.org/multipage/rendering.html`) publishes the exact normative UA stylesheet across `<pre><code class="css">` blocks. Extracting and normalizing those CSS blocks into `src/data/gen/ua-stylesheet.ts` via `scripts/codegen/generate_ua_stylesheet.ts` ensures `pnpm run maintain` / `pnpm run codegen` keeps our UA stylesheet automatically synchronized with the spec, while our own `parseStyleSheet()` engine resolves selectors, shorthands, logical properties, and `em` units natively.

**Spec References**:
- WHATWG HTML Standard § 15.3 (`https://html.spec.whatwg.org/multipage/rendering.html`)
- CSS Cascading and Inheritance Level 5 § 6.1 (`#cascading-origins`) & § 6.2 (`#default`)
- SVG 2 § 13.2 (Presentation attributes & initial defaults)

### Tasks
- [x] Create `scripts/codegen/generate_ua_stylesheet.ts` that extracts the `<pre><code class="css">` blocks from the WHATWG HTML spec source (`submodules/whatwg-html/source`, shallow submodule updated by `pnpm run maintain`), strips `@namespace` / pseudo-rules that don't apply, and generates `src/data/gen/ua-stylesheet.ts`. The `<body>` 8px margin comes from the spec source's `<!-- body { margin: 8px; } -->` editor comment; codegen fails loudly if it disappears.
- [x] Wire `generate_ua_stylesheet.ts` into `scripts/codegen/generate_all.ts` and document in `MAINTENANCE.md` so `pnpm run codegen` and `pnpm run maintain` automatically regenerate `src/data/gen/ua-stylesheet.ts`.
- [x] Lazily parse `UA_STYLESHEET_CSS` via `parseStyleSheet()` and integrate it into the cascade / UA fallback resolution so `em` units, logical properties (`margin-block-start`), and shorthands (`margin`) resolve dynamically through our engine.
- [x] Delete the imperative `if (tag === 'H1') ...` ladder and `BLOCK_TAGS` duplication from `getUaDefault()` in `src/cascade/value-processor.ts`.
- [x] Verify 100% pass rate on `revert-val-005.html`, `css-cascade`, and full WPT baseline with `pnpm run preflight`.

## Phase 148: Benchmark Suite Expansion & Post-Janitor Performance Check [x]
**Objective**: Phases 143–146 removed ~1,900 lines from `src/parser.ts`, `src/shorthands.ts`, `src/serializer.ts`, `src/MediaParser.ts`, and `src/rules/at-rules.ts`, verified for behavior but not speed. [`scripts/benchmarks/parser.bench.ts`](./scripts/benchmarks/parser.bench.ts) only measured tokenize/parse of one small synthetic sheet repeated 1000×.

### Tasks
- [x] Expand the benchmark to cover more realistic inputs (real-world stylesheets, nesting, selectors, custom properties, at-rules, large values) and more API paths (`parseStyleSheet`, `CSSStyleDeclaration.setProperty` / `cssText` with shorthands, serialization, selector matching, cascade / `getComputedStyle`, Typed OM parsing).
- [x] Make results statistically trustworthy (multiple samples, median/variance, warmup, GC isolation) and comparable across git refs (e.g. `v0.1.8` vs `HEAD`).
- [x] Record the `f8c80d0` (pre-janitor) → `1db8d91` (post-janitor) comparison and flag any regressions from Phases 143–147.

### Noise Floor Measurement & Methodological Hardening
1. **Measured Noise Floor in Unisolated In-Process Runs**: Initial single-process A/A testing (`f8c80d0` vs `f8c80d0` in the same Node instance) exhibited a **~41% noise floor**. Root causes:
   - Cumulative V8 heap footprint (>600MB) causing subsequent benchmarks to experience aggressive scavenge / mark-sweep GC cycles.
   - Hidden class and Inline Cache (IC) pollution across disparate benchmark workloads.
2. **Investigation of Allocation & GC Variance (Unbiased Instrumentation)**:
   - Prior attempts trimmed top 25% and bottom 10% samples to suppress GC pauses, which artificially shifted median wall times to ~p45 and concealed GC-driven regressions.
   - **Fix Applied**: Calculate completely unbiased statistics (raw median, mean, standard deviation, min, max) across all recorded samples without quantile trimming. Explicitly measure GC pause times and counts via `PerformanceObserver('gc')` entries, and pass `--expose-gc` with pre-sample `globalThis.gc()` clearing.
   - **Normalized GC & Peak ΔHeap Reporting**: Rather than reporting misleading peak heap watermarks as "Allocations" or unnormalized GC sums, report `GC ms/sample` (and `% of total time`), `GC/iter`, and `Peak ΔHeap` (maximum heap increase over initial baseline per run).
3. **Automated Import-Graph Control Derivation with ParseHooks DI Dependency**:
   - Rather than relying on fragile manual file mappings that miss transitive imports (e.g. `matcher.ts` and `typed-om` invoking `tokenize` and `Parser.parseComponentValues`), entry modules are analyzed via a transitive import graph crawler.
   - The crawler explicitly accounts for runtime dependency injection (`src/parse-hooks.ts` -> `src/parser.ts`), ensuring anything reaching `ParseHooks` correctly tracks `parser.ts` dependency by construction.
   - Any benchmark whose transitive runtime source files are 100% byte-identical between the compared refs is automatically designated and checked as a control.
4. **Statistical Significance via Bootstrap 95% Confidence Intervals & Multi-Round A/A Validation**:
   - Replaced fixed fitted thresholds with fresh subprocess runs per ref executed in an interleaved (ABAB...) order across worktrees.
   - A 3,000-repetition bootstrap computes the 95% confidence interval of the median throughput delta. Any result whose 95% CI excludes 0 is flagged as significant: changes with `|delta| >= 2.0%` are categorized as `faster` or `slower`, while `|delta| < 2.0%` are pre-registered and labeled as `significant, small`.
   - **Validation via Multi-Round A/A Runs**: Evaluated across 3 rounds × 14 benchmarks = 42 total trials on identical commit `f8c80d0` (10 interleaved runs per trial). Observed **1 false positive out of 42 trials (2.4% observed false-positive rate)**, exact one-sided 95% upper bound ≈ 11% (the 6.9% figure previously stated here is the bound for 0/42).
5. **Synthetic Pre-Tokenized Parser Throughput**:
   - `parse: synthetic large tokens` exhibits a small (~1-4%) slowdown on raw synthetic pre-tokenized token arrays across repeated runs (`-1.6%`, 95% CI: `[-9.5%, +14.9%]`). This effect does not appear in combined `tokenize + parse` or any real-world stylesheet benchmarks.
6. **True Full Round-Trip Benchmark**:
   - The round-trip benchmark was updated from pre-parsed rule iteration to a true text → `parseStyleSheet()` → serialize rules → re-`parseStyleSheet()` end-to-end pipeline on `geocities.css`.

### Pre-Janitor (`f8c80d0`) vs Post-Janitor (`1db8d91`) Comparison Results (15 Interleaved Runs per Ref)

| Benchmark | `f8c80d0` (ms) | `1db8d91` (ms) | Delta (ops/s) | 95% CI | `f8c80d0` GC | `1db8d91` GC | `f8c80d0` Peak ΔHeap | `1db8d91` Peak ΔHeap | Significance |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `tokenize: synthetic large (163KB)` | 64.17 ±9.53 | 67.45 ±5.02 | -4.9% | [-13.1%, +6.9%] | 12.11ms (15.4%) | 14.84ms (17.5%) | 112.3MB | 116.9MB | flat (within noise) [source unchanged] |
| `tokenize: modern.css (7.7KB)` | 11.53 ±0.98 | 11.23 ±0.83 | +2.7% | [-6.5%, +8.9%] | 1.09ms (6.9%) | 2.04ms (13.0%) | 71.7MB | 83.9MB | flat (within noise) [source unchanged] |
| `parse: synthetic large tokens (163KB)` | 165.97 ±17.33 | 168.64 ±15.37 | -1.6% | [-9.5%, +14.9%] | 15.34ms (8.0%) | 14.19ms (7.4%) | 125.7MB | 127.6MB | flat (within noise) |
| `tokenize + parse: synthetic large (163KB)` | 228.53 ±28.34 | 210.85 ±20.98 | +8.4% | [-8.8%, +15.1%] | 35.71ms (13.2%) | 31.01ms (12.2%) | 150.3MB | 138.4MB | flat (within noise) |
| `tokenize + parse: geocities.css (15KB)` | 126.54 ±16.30 | 125.02 ±15.43 | +1.2% | [-10.9%, +15.8%] | 20.83ms (13.4%) | 18.11ms (11.9%) | 123.7MB | 127.3MB | flat (within noise) |
| `tokenize + parse: whatwg styles.css (11KB)` | 92.04 ±33.51 | 89.34 ±8.41 | +3.0% | [-5.3%, +17.0%] | 14.31ms (12.0%) | 11.82ms (11.1%) | 107.5MB | 102.1MB | flat (within noise) |
| `tokenize + parse: modern.css (7.7KB)` | 62.13 ±6.88 | 63.27 ±7.53 | -1.8% | [-15.7%, +16.7%] | 8.33ms (11.2%) | 7.51ms (10.1%) | 110.3MB | 115.0MB | flat (within noise) |
| `tokenize + parse: postcss cases (4.4KB)` | 62.06 ±23.90 | 54.29 ±5.51 | +14.3% | [-3.0%, +18.9%] | 6.73ms (9.0%) | 5.69ms (8.8%) | 115.8MB | 120.2MB | flat (within noise) |
| `CSSStyleDeclaration: setProperty shorthands & read` | 103.23 ±11.07 | 103.64 ±8.73 | -0.4% | [-6.2%, +14.4%] | 0.88ms (0.8%) | 1.18ms (1.1%) | 63.8MB | 59.8MB | flat (within noise) |
| `serialize: modern.css rules cssText` | 59.13 ±4.94 | 38.65 ±2.36 | +53.0% | [+35.7%, +67.5%] | 0.33ms (0.5%) | 0.19ms (0.4%) | 60.2MB | 62.2MB | **+53.0%** (faster) |
| `round-trip: parse -> serialize -> reparse (geocities.css)` | 148.38 ±16.45 | 128.68 ±9.54 | +15.3% | [-0.7%, +30.7%] | 13.31ms (7.9%) | 11.89ms (7.9%) | 120.6MB | 117.0MB | flat (within noise) |
| `matcher: complex selectors matches()` | 13.52 ±1.94 | 13.41 ±2.14 | +0.8% | [-13.1%, +9.1%] | 1.71ms (9.1%) | 1.36ms (7.4%) | 70.1MB | 72.8MB | flat (within noise) |
| `cascade: getCascadedStyle()` | 62.76 ±6.79 | 59.96 ±7.17 | +4.7% | [-8.9%, +16.4%] | 1.58ms (2.2%) | 1.70ms (2.4%) | 72.0MB | 72.8MB | flat (within noise) |
| `typed-om: parse values & math` | 20.43 ±1.68 | 19.85 ±1.27 | +2.9% | [-6.9%, +6.8%] | 0.56ms (2.5%) | 0.40ms (1.8%) | 58.6MB | 57.2MB | flat (within noise) |

### Key Findings & Regression Analysis
- **Controls Confirmed**: `tokenize: modern.css` and `tokenize: synthetic large` were automatically verified as byte-identical control suites via import graph traversal and reported as flat within noise.
- **Serialization Speedup Confirmed (+53.0%)**: `serialize: modern.css rules cssText` achieved a confirmed **+53.0%** throughput improvement (95% CI: [+35.7%, +67.5%]). Based directly on git diff inspection of commit `ffd3eed` (`src/serializer.ts`), this speedup is caused by hoisting per-declaration array literals in `tryCombine*` shorthand combiners into module constants and replacing linear array `.includes()` lookups with `Set` checks (e.g. `NTH_PSEUDO_CLASSES`), combined with streamlined selector string formatting.
- **Parser Throughput Neutral**: Real-world stylesheet parsing across all corpora (`geocities.css`, `whatwg styles.css`, `modern.css`, `postcss cases`) remained strictly neutral, with all confidence intervals encompassing 0.
- **Synthetic Pre-Tokenized Parser Behavior**: Synthetic large token parsing showed a small non-significant delta (`-1.6%`, 95% CI: `[-9.5%, +14.9%]`) under 15 fresh-process interleaved runs. Combined `tokenize + parse` showed no regression (`+8.4%`, 95% CI: `[-8.8%, +15.1%]`). Zero regressions detected across real-world workloads.

## Phase 149: HTML UA Stylesheet as a Real Cascade Origin [x]
**Objective**: `src/data/gen/ua-stylesheet.ts` is parsed, but only consumed by `getUaDefault()` as a per-tag property lookup. Feed the parsed sheet into the cascade as the actual user-agent origin (css-cascade-5 § 6.2 #cascading-origins) so selectors, specificity, ordering, and `revert` behave per spec, and delete the special-casing that exists to fake it (margin normalization in `getUaTagStyles()`, and `getUaDefault()` itself if possible).

### Tasks
- [x] Insert the UA stylesheet's rules as the user-agent origin in the cascade (normal and `!important`), matched via the real selector matcher.
- [x] Make `revert` roll back to UA-origin declarations.
- [x] Delete `getUaTagStyles()` margin/em normalization and as much of `getUaDefault()` as the cascade now covers. Net-negative line count expected.
- [x] Zero WPT regressions (`pnpm run wpt:verify`) and `pnpm run preflight` clean.

## Phase 150 (Future): Parser Performance — Eliminate Re-tokenization & Operate on Token Stream [ ]
**Gate**: Only start once Phase 148 benchmarks show where parser time goes; compare every change against that baseline.

Moved from earlier deferred items (Phase 13 "Avoid Re-tokenization", and CSS Syntax findings "Operate on Token Stream").

### Tasks
- [ ] **Avoid re-tokenization**: remove serialize→`tokenize()` round trips on already-parsed values. Known sites: shorthand expansion in [`CSSStyleDeclaration.ts`](./src/CSSStyleDeclaration.ts) (`tokenize(val)` for longhands), `parseStyleAttribute(tokenize(serialize(blockVal)))` in [`rule-filter.ts`](./src/cascade/rule-filter.ts), re-parsers in [`parser.ts`](./src/parser.ts) (`new Parser(tokenize(text, …))`, `` tokenize(`{ ${text} }`) ``), and name re-tokenization in [`variable-resolver.ts`](./src/cascade/variable-resolver.ts). Audit the 73 `tokenize(` call sites in `src/` and keep only true string entry points.
- [ ] **Operate on token stream**: evaluate refactoring the parser to consume the token stream directly (css-syntax-3 § 5 parser algorithms) instead of pre-grouped component values. Large change; only pursue if benchmarks justify it.

## Phase 151 (Future): Benchmark Sensitivity [ ]
**Status**: Parked (user deprioritized benchmark work after Phase 148). Pick up before Phase 150, since Phase 150 needs to detect small parser changes.

Phase 148's final harness (`a816dff`) was not re-audited. Known gaps:
- [ ] **Low power**: 95% CIs in the Phase 148 table are roughly ±10–15% wide, so only large changes (like the +53% serializer speedup) are detectable. Reduce per-run variance (e.g. more iterations per sample, CPU pinning, quieter machine) until A/A CIs are a few percent wide.
- [ ] **`parse: synthetic large tokens`**: earlier runs showed a CI-excluding-zero ~2–4% slowdown pre- vs post-janitor; the 15-run table shows -1.6% with CI [-9.5%, +14.9%]. Unresolved; re-measure once power improves, and profile with `--cpu-prof` before attributing a cause.
- [ ] **Review open questions**: whether pre-sample `globalThis.gc()` hides allocation cost from wall time, and whether the `|delta| < 2.0%` "significant, small" label was chosen a priori.

## Phase 152: Remove Layout Guessing from Computed Style [/]
**Objective**: Enforce [AGENTS.md § Browser-Only Capabilities](./AGENTS.md). Delete code that fakes layout-dependent used values and return computed values instead; lost WPT subtests must classify as `LAYOUT_GEOMETRY`, not count as genuine failures.

### Tasks
- [ ] Delete `shouldPreserveAutoMinSize` (regex over inline `style` attributes), auto `margin-left/right` centering arithmetic, and `perspective-origin` box-size resolution in [`computed-style.ts`](./src/cascade/computed-style.ts).
- [ ] Delete the `offsetWidth` / `offsetHeight` layout stub in [`dom-stubs.ts`](./tests/dom-shim/src/dom-stubs.ts).
- [ ] Narrow [`classifier.ts`](./scripts/wpt/node/core/classifier.ts) if needed (with tests in `tests/wpt-classifier.test.ts`), regenerate the passing-set baseline, and list every lost subtest.
- [ ] README § Intentional Non-Goals: layout-dependent used values return computed values.

Follow-ups (not layout guessing, separate fixes): `rem` hardcoded to 16px in `computed-style.ts` (`clip`) and `variable-resolver.ts` should resolve against the root element's font-size; relative-position `auto` insets should negate the opposite inset.

## Phase 153: Single Rule Model — Retire `ASTAtRule` from the Public `Rule` Type [ ]
**Objective**: `Rule = ASTAtRule | CSSRule` ([types.ts](./src/types.ts)) forces every consumer to handle a plain-object at-rule shape that only one feature still produces, which is where the cascade's `Rule | CSSRule | Declaration` signatures and `instanceof X || type === N` duck typing come from.

**History** (`history` branch): the union was a snapshot of a half-migrated parser written during an `any`-removal pass (`e788178`, Apr 13). Known at-rules became `CSSRule` classes on Apr 14 (`0fd930e`), unknown at-rules became `CSSAtRule` on Apr 25 (`8ae172d`). Since then `ASTAtRule` escapes the parser only via the `atRules` option ([parser.ts `finalizeAtRule`](./src/parser.ts), added in `0909f19`), used by the CSS Parser API ([parser-api.ts](./src/parser-api.ts)). Phase 126 removed double casts but kept the union.

### Tasks
- [ ] Return `atRules`-option custom at-rules as `CSSAtRule` (with child rules/declarations) instead of raw `ASTAtRule`; update `tests/parser-api.test.ts`.
- [ ] Make public `Rule` mean `CSSRule`; keep `ASTAtRule` private to the parser (scratch object for at-rule handlers). Stop exporting it from [index.ts](./src/index.ts); update the API surface snapshot and README.
- [ ] Narrow signatures and delete the dual-shape handling in `src/cascade/` (`index.ts`, `rule-filter.ts`, `layer-manager.ts`, `at-rule-manager.ts`) and `toParserRule` in `parser-api.ts`; remove the `(r as { type?: number }).type === N` fallbacks where `instanceof` suffices.
- [ ] Net-negative `src/`; 0 WPT regressions.

## Phase 154: Fix :lang() Matching [ ]
**Objective**: Implement spec-compliant CSS Selectors 4 § 7.2 `:lang()` pseudo-class matching using RFC 4647 extended language range filtering.

Currently, `src/matcher.ts` uses basic prefix matching (`elementLang === clean || elementLang.startsWith(clean + '-')`), which fails RFC 4647 extended filtering, wildcard ranges, and XML document handling.

### Todo Cases Catalogued in `tests/selectors-lang.test.ts`
- [ ] **RFC 4647 Extended Filtering (Script Subtags & Wildcards)**:
  - Language range matching when tags contain intermediate script/region subtags (e.g., `:lang(cs-CZ)` matching `lang="cs-Latn-CZ"`, `:lang(fr-FR)` matching `lang="fr-Latn-FR"`).
  - Wildcard ranges in selector lists (e.g., `:lang(*-Latn)`, `:lang(*-CH)`, `:lang(*-FR)`, `:lang(*-x-foobar)`).
  - Escaped wildcard ranges (e.g., `:lang(\*-FR)`).
- [ ] **Private-Use Subtag & Singleton Handling**:
  - RFC 4647 step 3D singleton subtag handling (e.g., `:lang("fr-x-foobar")` matching `lang="fr-Latn-FR-x-foobar"` while singletons block skipping).
- [ ] **Subtag Length Boundaries**:
  - RFC 4647 8-character subtag limit enforcement (e.g., `:lang(fr)` must not match `lang="fr-ninechars"`).
- [ ] **Argument Syntax Resilience & Whitespace**:
  - Argument list parsing resilience for numbers/idents (e.g., `:lang(de, nl, 0, fr)`, `:lang(0)`).
- [ ] **XML Document `xml:lang` Attribute Semantics**:
  - Support `xml:lang` lookup in XML documents while ignoring it in HTML documents per CSS Selectors 4 / HTML specification.

## Potential Roadmap (Needs Discussion)
Candidates from a read-only deletion audit and a code-organization investigation (Sep 24), including a comparison with Blink (`third_party/blink/renderer/core/css/`), csstree, postcss, and lightningcss. Line estimates are the auditors' and unverified. **Not approved; discuss before scheduling.**

- **Dead exports** (~60 lines): `compareLayerOrder`, `hasUnknownFeature`, `PAGE_DESCRIPTORS`, `isKeywordValue`, `radToDeg` etc. have no references outside their defining file.
- **`Parser.resolveVariables`** (~140): a second variable-substitution engine in [parser.ts](./src/parser.ts) alongside [variable-resolver.ts](./src/cascade/variable-resolver.ts). Public API, so a thin wrapper would remain.
- **`StreamingTokenizerStream`** (~50): only used by `tests/streaming.test.ts`.
- **Codegen hand-maintained lists** (~70): `INHERITED_PROPERTIES`, extra initial values, known pseudo-element sets from `mdn-data` / `@webref/css`.
- **Codegen box-shorthand tables and shorthand getters** (~580): `shorthands.ts`, `serializer.ts`, `computed-style.ts`.
- **Unify math engines** (~250): unit tables and simplification duplicated between [math-parser.ts](./src/math-parser.ts) and Typed OM `CSSMathOperations.ts`.
- **Unify color handling** (~110): [color-resolver.ts](./src/cascade/color-resolver.ts) vs Typed OM `color-spaces.ts`.
- **Keep parsed tokens on declarations** (overlaps Phase 150): declaration values stored as strings cause most of the 73 `tokenize()` calls; Blink keeps parsed values and never re-tokenizes.
- **Considered and not recommended**: reorganizing `src/` by feature (git co-change data shows commits cluster at engine boundaries, median 4 files); Blink-style per-property classes (Blink's hand-written hooks still collapse into 12.8k-line `longhands_custom.cc`, so it organizes without shrinking).
- **Possible perf idea**: Blink's bit-packed `CascadePriority` for single-integer cascade comparisons; speed, not size.
