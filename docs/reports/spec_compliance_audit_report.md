# High-Scrutiny W3C/WHATWG Specification Compliance & Citation Hygiene Audit Report

**Audit Date**: 2026-10-26 (Post-Phase 150.1 & `pnpm run maintain`, Base Commit `233e66b06`)
**Status**: **VERIFIED by `Scrutineer` (`Scrutineer A` & `Scrutineer B`) + Empirical WPT Cross-Check**

This report consolidates findings from 10 parallel domain-specific specification compliance auditors comparing `src/` against the vendored specifications in `submodules/csswg-drafts/`, `submodules/css-houdini-drafts/`, and `submodules/whatwg-html/source`, followed by adversarial `Scrutineer` validation and empirical WPT verification.

- **Part 1: Validated Behavioral Compliance Findings (`37` valid items; `10` invalidated/pruned)**
- **Part 2: Validated Citation Hygiene Findings (`28` Retarget, `9` Prune groups, `14` high-bar Add items)**
- **Part 3: Invalidated / Rejected Auditor Claims (Audit Trail)**

---

## Part 1: Validated Behavioral Compliance Findings

### Domain 1: CSSOM (`cssom-1`, `css-style-attr-1`)

- **`BC-01` [High — VALID] `MediaList.prototype.deleteMedium` throws `NotFoundError` when argument parses to multiple media queries or `null`**
  - **Spec**: `cssom-1 #dom-medialist-deletemedium` (steps 1–2) & `cssom-1 #parsing-media-queries`
  - **Location**: [`src/rules/collections.ts:112-117`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/collections.ts#L112-L117)
  - **Discrepancy**: Step 1 parses the string as a single media query (returning `null` if `parsed.length !== 1`, e.g. `"screen, print"` or empty). Step 2 mandates: *"If m is null, then return."* Currently `if (parsed.length !== 1)` throws `NotFoundError` instead of returning early.
  - **Fix**: Replace the `NotFoundError` throw on `if (parsed.length !== 1)` with `return;`.

- **`BC-02` [Medium — VALID] `CSSStyleDeclaration.prototype.setProperty` erroneously removes property when `value` is `undefined`**
  - **Spec**: `cssom-1 #the-cssstyledeclaration-interface` (`[LegacyNullToEmptyString] CSSOMString value`) & `cssom-1 #dom-cssstyledeclaration-setproperty` (steps 3, 5, 6)
  - **Location**: [`src/CSSStyleDeclaration.ts:505-509`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L505-L509)
  - **Discrepancy**: Under WebIDL `[LegacyNullToEmptyString]`, only `null` converts to `""`; `undefined` converts to `"undefined"`, which fails value parsing in steps 5–6 and leaves the existing declaration untouched (verified in WPT `css/cssom/setproperty-null-undefined.html`). Currently `if (value === null || value === '' || value === undefined)` calls `this.removeProperty(property)` on `undefined`.
  - **Fix**: Coerce `const valStr = value === null ? '' : String(value);` and only invoke `this.removeProperty(property)` when `valStr === ''`.

- **`BC-04` [Low — VALID] `CSSPropertyRule.prototype.type` returns `18` instead of `0`**
  - **Spec**: `cssom-1 #dom-cssrule-type`
  - **Location**: [`src/rules/at-rules.ts:925`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/at-rules.ts#L925)
  - **Discrepancy**: `cssom-1 #dom-cssrule-type` freezes legacy rule types at 1–14 and requires all other at-rules to return `0`. `CSSPropertyRule` defines `get type() { return 18; }`.
  - **Fix**: Delete `get type() { return 18; }` from `CSSPropertyRule` so it inherits `0` from `CSSRule`.

- **`BC-05` [Low — VALID] `CSSStyleDeclaration.prototype.removeProperty` bypasses `getPropertyValue` canonical serialization for longhands**
  - **Spec**: `cssom-1 #dom-cssstyledeclaration-removeproperty` (step 3)
  - **Location**: [`src/CSSStyleDeclaration.ts:684-696`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L684-L696)
  - **Discrepancy**: Step 3 requires recording `const value = this.getPropertyValue(property)` prior to removing the declaration. For longhands, `removeProperty` calls `serialize(decl.value, ...)`, bypassing canonicalization in `getPropertyValue`.
  - **Fix**: Capture `const oldValue = this.getPropertyValue(property);` before splicing and return `oldValue`.

---

### Domain 2: CSS Syntax (`css-syntax-3`)

- **`BC-07` [Medium — VALID] `consumeUnicodeRangeToken` drops empty ranges (`end < start`) as `delim('U')` after consuming `+` and hex digits**
  - **Spec**: `css-syntax-3 #consume-unicode-range-token` (step 5.3) & `css-syntax-3 #tokenizer-definitions` (`<unicode-range-token>`)
  - **Location**: [`src/AbstractTokenizer.ts:560-572`](file:///usr/local/google/home/paulirish/code/cssom/src/AbstractTokenizer.ts#L560-L572)
  - **Discrepancy**: When `end < start` (e.g. `U+500-100`), `if (end > 0x10FFFF || end < start)` returns `{ type: 'delim', value: 'U' }` after already consuming `+500-100`, swallowing those characters from the token stream (whereas semantic range validation `start <= end && end <= 0x10FFFF` belongs at descriptor validation time in `src/parser.ts`).
  - **Fix**: Emit `<unicode-range-token>` in `consumeUnicodeRangeToken` and validate `start <= end && end <= 0x10FFFF` in `unicode-range` descriptor validation (`src/parser.ts`).

- **`BC-08` [Medium — VALID] `validateDeclarationValue` permits unmatched closing brackets (`)`, `]`, `}`) and top-level `;` / `!` in standard declarations**
  - **Spec**: `css-syntax-3 #any-value` (`<declaration-value>`)
  - **Location**: [`src/parser.ts:1480-1492`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L1480-L1492)
  - **Discrepancy**: Unlike `Parser.validateCustomPropertyValue`, `validateDeclarationValue` only checks for `bad-string` and `bad-url`, allowing unmatched `)`, `]`, `}`, top-level `;`, or top-level `!` in standard declarations.
  - **Fix**: Reject unmatched `)`, `]`, `}` at any depth and `;` or `delim('!')` at top level in `validateDeclarationValue`.

- **`BC-09` [Low — VALID] `Parser.prototype.parseDeclaration` does not verify EOF after consuming a declaration**
  - **Spec**: `css-syntax-3 #parse-declaration` (steps 5–6)
  - **Location**: [`src/parser.ts:308-313`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L308-L313)
  - **Discrepancy**: `parseDeclaration()` consumes up to the first semicolon or EOF without checking that the remainder of the input stream is empty (`EOF`).
  - **Fix**: Verify only whitespace/EOF remains after consuming the declaration; otherwise return `null`.

- **`BC-10` [Low — VALID] `serializeToken` does not serialize `<delim-token>` `\` as `'\\\n'`**
  - **Spec**: `css-syntax-3 #serialization-tables`
  - **Location**: [`src/serializer.ts:235-236`](file:///usr/local/google/home/paulirish/code/cssom/src/serializer.ts#L235-L236)
  - **Discrepancy**: A `<delim-token>` containing `\` (`U+005C`) must be serialized as `'\\\n'` so it does not escape the following token upon re-tokenization.
  - **Fix**: Return `token.value === '\\' ? '\\\n' : token.value` for `case 'delim':`.

---

### Domain 3: Selectors (`selectors-4`, `css-namespaces-3`, `html`)

- **`BC-12` [Low — VALID] In XML documents, no-namespace `lang` attribute is honored on non-HTML/non-SVG elements**
  - **Spec**: `html #the-lang-and-xml:lang-attributes` (step 2)
  - **Location**: [`src/matcher.ts:1058-1061`](file:///usr/local/google/home/paulirish/code/cssom/src/matcher.ts#L1058-L1061)
  - **Discrepancy**: Step 2 specifies that no-namespace `lang` is used only *"If the node is an HTML element or an element in the SVG namespace"*. On arbitrary XML/MathML elements in an XML document, only `xml:lang` in the XML namespace applies.
  - **Fix**: Gate un-namespaced `curr.hasAttribute('lang')` on `!isXml || curr.namespaceURI === 'http://www.w3.org/1999/xhtml' || curr.namespaceURI === 'http://www.w3.org/2000/svg'`.

---

### Domain 5: Properties & Variables (`css-variables-1`, `css-properties-values-api`)

- **`BC-21` [High — VALID] `consumeSyntaxComponent` in `PropertyRegistry.ts` permits whitespace before multipliers (`+`, `#`) and accepts `?`, `*`, `{...}` multipliers**
  - **Spec**: `css-properties-values-api #multipliers` & `#consume-syntax-component`
  - **Location**: [`src/PropertyRegistry.ts:126-151`](file:///usr/local/google/home/paulirish/code/cssom/src/PropertyRegistry.ts#L126-L151)
  - **Discrepancy**: `#consume-syntax-component` allows only immediate `+` or `#` multipliers with no intervening whitespace, and prohibits `?`, `*`, and `{a,b}`.
  - **Fix**: Reject whitespace before multipliers and accept only immediate `+` or `#` delimiters.

- **`BC-22` [Medium — VALID] `PropertyRegistry.ts` `VALID_COMPONENTS` accepts unsupported `<flex>` syntax component**
  - **Spec**: `css-properties-values-api #supported-names`
  - **Location**: [`src/PropertyRegistry.ts:33-37,214`](file:///usr/local/google/home/paulirish/code/cssom/src/PropertyRegistry.ts#L33-L37)
  - **Discrepancy**: `<flex>` is not a supported syntax component name in `#supported-names`.
  - **Fix**: Remove `'flex'` from `VALID_COMPONENTS` and line 214.

- **`BC-23` [Medium — VALID] `matchesSyntax` in `PropertyRegistry.ts` ignores `+` and `#` multipliers on `<custom-ident>` literal components**
  - **Spec**: `css-properties-values-api #multipliers` & `#supported-names`
  - **Location**: [`src/PropertyRegistry.ts:248-264`](file:///usr/local/google/home/paulirish/code/cssom/src/PropertyRegistry.ts#L248-L264)
  - **Discrepancy**: Multiplier branching (`#` and `+`) is nested inside `if (name.startsWith('<') && name.endsWith('>'))`, so literal ident syntax components like `"big+"` or `"foo#"` fail on multi-token values.
  - **Fix**: Apply `+` and `#` list splitting/matching uniformly to both `<data-type>` and `<custom-ident>` literal syntax components.

- **`BC-24` [High — VALID] `resolveCustomProperties` does not validate declared values against registered custom property syntax (`matchesSyntax`)**
  - **Spec**: `css-properties-values-api #calculation-of-computed-values`
  - **Location**: [`src/cascade/variable-resolver.ts:608-724`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/variable-resolver.ts#L608-L724)
  - **Discrepancy**: When a custom property is registered with non-universal syntax (e.g. `<color>`), `resolveCustomProp` does not validate `subVal` with `matchesSyntax`, allowing invalid values (e.g. `100px`) into `resolvedCustomProps` instead of treating them as invalid at computed-value time.
  - **Fix**: Validate `subVal` against `def.syntax` via `matchesSyntax` when `def.syntax !== '*'`; if invalid, fall back to `parentVal` (if `def.inherits`) or `def.initialValue ?? ''`.

- **`BC-25` [Medium — VALID] Variable substitution failure or cycle on a registered custom property sets `''` instead of resetting to inherited/initial value**
  - **Spec**: `css-properties-values-api #calculation-of-computed-values`
  - **Location**: [`src/cascade/variable-resolver.ts:626-633`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/variable-resolver.ts#L626-L633)
  - **Discrepancy**: For a registered custom property (`syntax !== '*'`), becoming invalid at computed-value time must reset to `parentVal` (if `def.inherits` and not cyclic) or `def.initialValue ?? ''` (if `!def.inherits`), rather than storing `''`.

- **`BC-26` [Low — PARTIALLY VALID] Standalone `resolveVariables` accepts optional `activeProperties` map**
  - **Spec**: `css-properties-values-api #determining-registration`
  - **Location**: [`src/cascade/variable-resolver.ts:538-539`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/variable-resolver.ts#L538-L539)
  - **Discrepancy**: Allow optional `activeProperties` lookup before `PropertyRegistry.get(property)` in `resolveVariables`.

---

### Domain 6: CSS Nesting (`css-nesting-1`)

- **`BC-27` [High — VALID] `CSSNestedDeclarations` cascade matching fails when parent style rule has comma-separated selector list with pseudo-elements (e.g. `.foo, .foo::before, .foo::after`)**
  - **Spec**: `css-nesting-1 #nested-declarations`
  - **Location**: [`src/cascade/rule-filter.ts:852-869`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/rule-filter.ts#L852-L869)
  - **Discrepancy**: `rule-filter.ts` tests `selectorToMatch.endsWith(normalizedPseudo)` and `/::[a-zA-Z-]+$/.test(selectorToMatch)` on the un-split `parentSelector` string instead of splitting with `splitSelectorList(parentSelector)`.
  - **Fix**: Split `parentSelector` via `splitSelectorList(parentSelector)` and match per complex selector identically to `CSSStyleRule`, tracking the highest matching specificity.

- **`BC-28` [Medium — VALID] `CSSNestedDeclarations` specificity is zeroed `[0, 0, 0]` for nested style rules inside `@scope`**
  - **Spec**: `css-nesting-1 #nested-declarations` & `css-nesting-1 #nesting-at-scope`
  - **Location**: [`src/cascade/rule-filter.ts:871-874`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/rule-filter.ts#L871-L874)
  - **Discrepancy**: `const spec = (scopeNode ? [0, 0, 0] : getMatchingSpecificity(element, selectorToMatch))` zeroes out specificity whenever `scopeNode` is truthy, even when `CSSNestedDeclarations` is inside a nested style rule (`@scope (.card) { .btn { @media (...) { color: blue; } } }`).
  - **Fix**: Zero out specificity only when `parentSelector` is empty or `':scope'` (i.e. directly nested under `@scope` with no enclosing style rule).

- **`BC-29` [Medium — PARTIALLY VALID] `CSSGroupingRule.prototype.insertRule` rejects non-grouping at-rules inside nested conditional group rules**
  - **Spec**: `cssom-1 #insert-a-css-rule`, `css-conditional-3 #contents-of-conditional-group-rules`, & `css-nesting-1 #conditionals`
  - **Location**: [`src/rules/base.ts:170-174`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/base.ts#L170-L174)
  - **Discrepancy**: *Scrutineer narrowed scope*: Non-grouping at-rules (`@keyframes`, `@property`, `@font-face`) inside a `CSSStyleRule` (or conditional rule with a `CSSStyleRule` ancestor) ARE forbidden per `css-nesting-1 #conditionals` and WPT `css/css-nesting/invalid-inner-rules.html`. However, `isNested` (`this.parentRule !== null`) also triggers for `@media` nested inside a top-level `@media` (with NO `CSSStyleRule` ancestor), where top-level statements like `@keyframes` or `@layer name;` ARE valid per `css-conditional-3 #contents-of-conditional-group-rules`.
  - **Fix**: Check whether any ancestor in the `parentRule` chain is a `CSSStyleRule` (`isInsideStyleRule`), rather than merely `this.parentRule !== null`.

---

### Domain 7: CSS Cascade & Computed Style (`css-cascade-5`, `css-cascade-6`, `css-color-4`)

- **`BC-30` [High — VALID] `revert-layer` rollback in `value-processor.ts` breaks on `!important` layered declarations and inline styles**
  - **Spec**: `css-cascade-5 #revert-layer` & `css-cascade-5 #cascade-layering`
  - **Location**: [`src/cascade/value-processor.ts:257-281`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/value-processor.ts#L257-L281)
  - **Discrepancy**: `while (prevIdx >= 0 && decls[prevIdx].layerOrder >= decl.layerOrder) prevIdx--;` fails on `!important` declarations (where earlier layers have higher precedence and lower-precedence important layers at `prevIdx` have *larger* `layerOrder`, causing all important layers to be skipped) and on inline styles (`isInline: true`, `layerOrder: Infinity`, where `Infinity >= Infinity` skips unlayered author rules).
  - **Fix**: Roll back past only declarations sharing the same inline/layer level (`decls[prevIdx].isInline === decl.isInline && decls[prevIdx].layerOrder === decl.layerOrder && decls[prevIdx].important === decl.important`).

- **`BC-31` [Medium — VALID] `scanLayers` in `layer-manager.ts` ignores `@supports` condition when discovering global layer order**
  - **Spec**: `css-cascade-5 #layer-ordering`
  - **Location**: [`src/cascade/layer-manager.ts:167-185`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/layer-manager.ts#L167-L185)
  - **Discrepancy**: `scanLayers` checks `CSSMediaRule` before recursing, but `CSSSupportsRule` falls through to generic `CSSGroupingRule` and registers `@layer` declarations even when `@supports` evaluates to `false`.
  - **Fix**: Gate `CSSSupportsRule` recursion in `scanLayers` on `!r.conditionText || supports(r.conditionText)`.

- **`BC-32` [Medium — VALID] `@import ... supports(...)` condition (`rule.supportsText`) is ignored in `rule-filter.ts` and `layer-manager.ts`**
  - **Spec**: `css-cascade-6 #conditional-import`
  - **Location**: [`src/cascade/rule-filter.ts:696-703`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/rule-filter.ts#L696-L703) & [`src/cascade/layer-manager.ts:139-146`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/layer-manager.ts#L139-L146)
  - **Discrepancy**: Neither file checks `if (rule.supportsText && !supports(rule.supportsText)) continue;` on `CSSImportRule`.
  - **Fix**: Check `rule.supportsText` via `supports(rule.supportsText)` in both `rule-filter.ts` and `layer-manager.ts`.

- **`BC-33` [Medium — VALID] Unset `border-*-color` and `outline-color` fallback in `computed-style.ts` resolves to `'rgb(0, 0, 0)'` instead of element's `color` (`currentcolor`)**
  - **Spec**: `css-color-4 #resolving-other-colors`
  - **Location**: [`src/cascade/computed-style.ts:397-399`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/computed-style.ts#L397-L399)
  - **Discrepancy**: When `border-*-color` or `outline-color` is unset on an element with `color: rgb(255, 0, 0)`, line 398 returns hardcoded `'rgb(0, 0, 0)'` instead of `this.getPropertyValue('color') || 'rgb(0, 0, 0)'`.
  - **Fix**: Return `this.getPropertyValue('color') || 'rgb(0, 0, 0)'` for unset `border-*-color` and `outline-color`.

---

### Domain 8: Media Queries (`mediaqueries-4`, `mediaqueries-5`)

- **`BC-34` [High — VALID] Range context `<mf-range>` inverts comparison operator when comparing a feature against an identifier value (`(resolution < infinite)`)**
  - **Spec**: `mediaqueries-4 #mq-syntax` & `mediaqueries-4 #resolution`
  - **Location**: [`src/MediaParser.ts:485-503`](file:///usr/local/google/home/paulirish/code/cssom/src/MediaParser.ts#L485-L503)
  - **Discrepancy**: When both `left` and `right` are identifiers (e.g. `resolution < infinite`), `rightIsIdent` is `true`, inverting `<` into `>` even though `featureName` was taken from `left[0]`.
  - **Fix**: Disambiguate `leftIsIdent && rightIsIdent` via `MediaQueryValidator.RANGE_FEATURES.has(leftName)` and invert only when the feature name is on the right.

- **`BC-35` [High — VALID] `normalizeAndValidate` strips `all and` before syntax validation, accepting invalid queries like `@media all and screen`**
  - **Spec**: `mediaqueries-4 #mq-syntax`, `mediaqueries-4 #error-handling`, & `cssom-1 #serializing-media-queries`
  - **Location**: [`src/MediaParser.ts:101-130`](file:///usr/local/google/home/paulirish/code/cssom/src/MediaParser.ts#L101-L130)
  - **Discrepancy**: `canonicalSerialize` strips leading `all and` before `MediaQueryValidator.validate()` runs, turning invalid `@media all and screen` into valid `screen` instead of `not all`.
  - **Fix**: Validate component values with `MediaQueryValidator` before stripping `all and` during canonical serialization.

- **`BC-36` [Medium — VALID] `(dynamic-range: standard)` and `(video-dynamic-range: standard)` fail to match when environment is `'high'`**
  - **Spec**: `mediaqueries-5 #dynamic-range` & `mediaqueries-5 #video-dynamic-range`
  - **Location**: [`src/MediaParser.ts:1049-1051`](file:///usr/local/google/home/paulirish/code/cssom/src/MediaParser.ts#L1049-L1051)
  - **Discrepancy**: A display supporting `'high'` dynamic range also matches `'standard'`.
  - **Fix**: Match `'standard'` whenever `env.dynamicRange` / `env.videoDynamicRange` is `'standard'` or `'high'`.

- **`BC-37` [Medium — VALID] `evaluateBooleanFeature` evaluates `(update)`, `(color-gamut)`, and `(video-color-gamut)` to `true` when value is `'none'`**
  - **Spec**: `mediaqueries-4 #mq-boolean-context`
  - **Location**: [`src/MediaParser.ts:915-946`](file:///usr/local/google/home/paulirish/code/cssom/src/MediaParser.ts#L915-L946)
  - **Discrepancy**: `update`, `color-gamut`, and `video-color-gamut` hit `default: return true;` even when the environment value is `'none'`.
  - **Fix**: Add explicit cases checking `!== 'none'` for `update`, `color-gamut`, and `video-color-gamut`.

---

### Domain 9: Conditional Rules (`css-conditional-3`, `css-conditional-4`, `css-conditional-5`)

- **`BC-38` [High — VALID] Grammatically invalid `@supports` preludes are not discarded during stylesheet parsing**
  - **Spec**: `css-conditional-3 #at-supports`
  - **Location**: [`src/parser.ts:141,433-437`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L433-L437)
  - **Discrepancy**: `AT_RULE_HANDLERS['supports']` constructs `CSSSupportsRule` without validating that `rule.prelude` matches `<supports-condition>` (including `<general-enclosed>`). Bare unparenthesized preludes like `@supports display: flex {}` or malformed boolean sequences like `@supports (a: b) and or (c: d) {}` must be ignored (`return null`).

- **`BC-39` [Medium — VALID] 2-argument `CSS.supports(property, value)` trims `property`, returning `true` on leading/trailing whitespace**
  - **Spec**: `css-conditional-3 #the-css-namespace` (`supports(property, value)`)
  - **Location**: [`src/parser-api.ts:374-377`](file:///usr/local/google/home/paulirish/code/cssom/src/parser-api.ts#L374-L377)
  - **Discrepancy**: 2-argument `CSS.supports(" width", "5px")` must return `false` (no whitespace trimming on `property`), whereas 1-argument `<supports-decl>` `( width: 5px )` does trim declaration name tokens.

- **`BC-40` [High — VALID] Trailing `!important` in `<supports-decl>` fails in `@supports (display: flex !important)` and `CSS.supports("(display: flex !important)")`**
  - **Spec**: `css-conditional-3 #at-supports` & `css-conditional-3 #the-css-namespace`
  - **Location**: [`src/parser-api.ts:449-457`](file:///usr/local/google/home/paulirish/code/cssom/src/parser-api.ts#L449-L457)
  - **Discrepancy**: Trailing `!important` is valid and ignored in `<supports-decl>` (and in 2-arg `CSS.supports(property, value)` per `css-conditional-3 #the-css-namespace`), but `evaluateSupportsDeclaration` passes raw `!important` into syntax matching where it fails.

- **`BC-41` [High — VALID] Grammatically invalid `not <bare-ident>` or `or` chains in `CSS.supports(conditionText)` evaluate to `true` (`CSS.supports("not foo")`)**
  - **Spec**: `css-conditional-3 #at-supports` & `#the-css-namespace`
  - **Location**: [`src/parser-api.ts:423-474`](file:///usr/local/google/home/paulirish/code/cssom/src/parser-api.ts#L423-L474)
  - **Discrepancy**: `evalSupportsConditionValues` evaluates `not <item>` and `and`/`or` chains without first verifying that every operand matches `<supports-in-parens>` (parenthesized block or function), causing `CSS.supports("not foo")` to return `!false === true`.

- **`BC-42` [Medium — VALID] `CSS.supports(conditionText)` uses ad-hoc colon regex slicing instead of the normative 2-step parenthesization fallback**
  - **Spec**: `css-conditional-3 #the-css-namespace` (`supports(conditionText)`)
  - **Location**: [`src/parser-api.ts:506-523`](file:///usr/local/google/home/paulirish/code/cssom/src/parser-api.ts#L506-L523)
  - **Discrepancy**: Replace ad-hoc colon regex slicing with the normative 2-step algorithm: (1) parse & evaluate `conditionText` as `<supports-condition>`; (2) if false, parse & evaluate `(${conditionText})` as `<supports-condition>`.

- **`BC-43` [Medium — VALID] Undeclared namespace prefixes inside `CSS.supports("selector(a|b)")` are not rejected**
  - **Spec**: `css-conditional-3 #the-css-namespace` & `css-conditional-4 #at-supports-ext`
  - **Location**: [`src/parser-api.ts:428-436`](file:///usr/local/google/home/paulirish/code/cssom/src/parser-api.ts#L428-L436)
  - **Discrepancy**: Pass `declaredNamespaces: new Set()` to `SelectorParser` inside `CSS.supports("selector(...)")` so any namespace prefix fails.

- **`BC-44` [Medium — VALID] Missing `CSSSupportsRule.prototype.matches` boolean getter**
  - **Spec**: `css-conditional-3 #the-csssupportsrule-interface` (and `submodules/web-platform-tests/interfaces/css-conditional.idl`)
  - **Location**: [`src/rules/at-rules.ts:98-123`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/at-rules.ts#L98-L123)
  - **Discrepancy**: `CSSSupportsRule` omits `readonly attribute boolean matches;` (which evaluates `this.conditionText` via `ParseHooks.supports`).

---

### Domain 10: Logical Properties & Shorthands (`css-logical-1`, `cssom-1`)

- **`BC-45` [High — VALID] `logical` keyword shorthand serialization prepends `'logical '` to CSS-wide keywords (`'logical inherit'`) and omits `border-width`, `border-style`, `border-color`**
  - **Spec**: `css-logical-1 #logical-shorthand-keyword` & `css-values-4 #common-keywords`
  - **Location**: [`src/CSSStyleDeclaration.ts:332-338`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L332-L338)
  - **Fix**: Do not prepend `'logical '` when `res` is a CSS-wide keyword (`CSS_WIDE_KEYWORDS.has(res.toLowerCase())`), and include `'border-width'`, `'border-style'`, `'border-color'` in the `logical`-prefixed shorthand list.

- **`BC-46` [High — VALID] `ALL_SHORTHAND_LONGHANDS` excludes flow-relative logical properties, and `hasOverridingLonghand` / `LONGHAND_TO_SHORTHAND` omit `logicalLonghands` / `physicalLonghands`**
  - **Spec**: `css-logical-1 #box` & `cssom-1 #serializing-css-values`
  - **Location**: [`src/shorthands.ts:1352-1361,1602-1615`](file:///usr/local/google/home/paulirish/code/cssom/src/shorthands.ts#L1352-L1361) & [`src/CSSStyleDeclaration.ts:341-352`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L341-L352)
  - **Fix**: Include flow-relative logical properties (ordered before physical longhands per `css-logical-1 #box`) in `ALL_SHORTHAND_LONGHANDS`, include `shorthand.logicalLonghands` in `hasOverridingLonghand`, and index `def.physicalLonghands` in `LONGHAND_TO_SHORTHAND`.

- **`BC-47` [Low — VALID] `resolveLogicalProperty` in `generate_logical_mappings.ts` omits `sideways-rl` and `sideways-lr` writing modes**
  - **Spec**: `css-logical-1 #intro` & `css-writing-modes-4 #abstract-box`
  - **Location**: [`scripts/codegen/generate_logical_mappings.ts:138-152`](file:///usr/local/google/home/paulirish/code/cssom/scripts/codegen/generate_logical_mappings.ts#L138-L152) & [`src/data/gen/LogicalMapping.ts:249-263`](file:///usr/local/google/home/paulirish/code/cssom/src/data/gen/LogicalMapping.ts#L249-L263)
  - **Fix**: Update `scripts/codegen/generate_logical_mappings.ts` to handle `sideways-rl` and `sideways-lr` alongside `vertical-rl` / `vertical-lr` and re-run `pnpm run codegen`.

---

## Part 2: Validated Citation Hygiene Findings

### A. Retarget (`CH-R01` – `CH-R28` — All 28 Validated)
1. **`CH-R01`** [`src/rules/base.ts:108`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/base.ts#L108): Prune/retarget bare section `// 6.13 The CSSRule Interface` -> `// cssom-1 #the-cssrule-interface`.
2. **`CH-R02`** [`src/rules/at-rules.ts:67`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/at-rules.ts#L67): Replace bare section `// 6.17 The CSSMediaRule Interface` -> `// cssom-1 #serialize-a-css-rule`.
3. **`CH-R03`** [`src/CSSOM.ts:595`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSOM.ts#L595): Replace `// 6.14 The CSSStyleRule Interface & css-nesting-1 #the-cssnestrule` -> `// cssom-1 #serialize-a-css-rule`.
4. **`CH-R04`** [`src/rules/utils.ts:37`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/utils.ts#L37): Replace `// cssom-1 #the-cssgroupingrule-interface` -> `// cssom-1 #serialize-a-css-rule`.
5. **`CH-R05`** [`src/CSSStyleDeclaration.ts:485`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L485): Replace `// cssom-1 #the-cssstyledeclaration-interface` -> `// cssom-1 #dom-cssstyledeclaration-setproperty`.
6. **`CH-R06`** [`src/rules/base.ts:146-147`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/base.ts#L146-L147): Replace `// cssom-1 #the-cssgroupingrule-interface` & `// css-nesting-1 #the-cssnestrule` -> `// cssom-1 #dom-cssgroupingrule-insertrule: step 4 wraps declarations in CSSNestedDeclarations`.
7. **`CH-R07`** [`src/rules/base.ts:170`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/base.ts#L170): Replace `// css-nesting-1 #nesting: only style rules and conditional group rules may be nested` -> `// css-nesting-1 #conditionals: style rules only allow conditional group rules; nested conditional rules allow top-level rules`.
8. **`CH-R08`** [`src/rules/base.ts:227`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/base.ts#L227): Replace `// cssom-1 #the-cssgroupingrule-interface` -> `// cssom-1 #dom-cssgroupingrule-deleterule`.
9. **`CH-R09`** [`src/parser.ts:261,270,275,291,297,302,307,315,324,342,395,849-851,903-905,1329,1356,1378`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L261): Replace all 16 bare `// 5.x.y ... https://drafts.csswg.org/css-syntax/#...` comments with canonical `// css-syntax-3 #<anchor>` (and `// css-style-attr-1 #syntax` on `parseStyleAttribute` at line 291; fix nonexistent `#parse-block-contents` / `#consume-list-of-declarations` to `#consume-block-contents`).
10. **`CH-R10`** [`src/parser.ts:1064`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L1064): Replace broken `// css-syntax-3 #consume-a-declaration Step 7` -> `// css-syntax-3 #consume-declaration: step 7 whitespace trimming`.
11. **`CH-R11`** [`src/parser.ts:1299`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L1299): Replace `// css-nesting-1 #nest-selector & #cssom` -> `// css-nesting-1 #cssom: absolutize relative selector by inserting implied nesting selector`.
12. **`CH-R12`** [`src/parser.ts:1415`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L1415): Replace `// css-nesting-1 #the-cssnestrule` on `parseRuleInBlockText` -> `// css-syntax-3 #consume-block-contents`.
13. **`CH-R13`** [`src/serializer.ts:25-26,302,360`](file:///usr/local/google/home/paulirish/code/cssom/src/serializer.ts#L25): Replace `@see https://drafts.csswg.org/...` URLs with canonical `// css-syntax-3 #serialization-tables`, `// cssom-1 #serialize-an-identifier`, and `// cssom-1 #serialize-a-string`.
14. **`CH-R14`** [`src/matcher.ts:60-61`](file:///usr/local/google/home/paulirish/code/cssom/src/matcher.ts#L60-L61): Fix syntax typos `// selectors-4 #case-sensitive)` and `// html#case-sensitivity-of-selectors` -> `// selectors-4 #case-sensitive` and `// html #case-sensitivity-of-selectors`.
15. **`CH-R15`** [`src/matcher.ts:960`](file:///usr/local/google/home/paulirish/code/cssom/src/matcher.ts#L960): Replace `// RFC 4647 #the-lang-pseudo` -> `// selectors-4 #the-lang-pseudo: extended filtering per rfc4647 § 3.3.2`.
16. **`CH-R16`** [`src/specificity.ts:157,169`](file:///usr/local/google/home/paulirish/code/cssom/src/specificity.ts#L157): Replace non-vendored `css-shadow-1` with vendored `// css-scoping-1 #host-selector` and `// css-scoping-1 #slotted-pseudo`.
17. **`CH-R17`** [`src/math-parser.ts:363,367,399,424,509-512`](file:///usr/local/google/home/paulirish/code/cssom/src/math-parser.ts#L363): Replace bare section comments `// 10 Mathematical Expressions`, `// 10.1 ...` with `// css-values-4 #math`, `#calc-func`, `#comp-func`, `#trig-funcs`, `#exponent-funcs`, `#sign-funcs`, `#round-func`.
18. **`CH-R18`** [`src/typed-om/style-map/StylePropertyMapReadOnly.ts:38,66`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/style-map/StylePropertyMapReadOnly.ts#L38): Retarget to `// css-typed-om #the-stylepropertymap` and `// css-typed-om #dom-stylepropertymapreadonly-declarations-slot: ordering of declarations slot by property category`.
19. **`CH-R19`** [`src/typed-om/values/style-value-parser.ts:308,363`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/values/style-value-parser.ts#L308): Replace fragile `(Overview.bs lines 3622+)` and `(lines 5307-5315)` line references with `#reify-property` and `#reification` anchors.
20. **`CH-R20`** [`src/typed-om/transform/CSSTransformComponent.ts:24`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/transform/CSSTransformComponent.ts#L24): Replace `// css-typed-om #dom-cssrotate-angle` on `normalizeAngleUnits` with `// css-transforms-2 #transform-functions: angle normalization`.
21. **`CH-R21`** [`src/cascade/variable-resolver.ts:62-64,311,452,576,687`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/variable-resolver.ts#L62): Deduplicate `#using-variables` and retarget to `#replace-a-var`, `#calculation-of-computed-values`, `#determining-registration`, and `#specified-value`.
22. **`CH-R22`** [`src/cascade/at-rule-manager.ts:27`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/at-rule-manager.ts#L27): Retarget `// css-properties-values-api #calculation-of-computed-values` on `collectActiveAtRules` -> `// css-properties-values-api #determining-registration`.
23. **`CH-R23`** [`src/cascade/cascade-sorter.ts:119`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/cascade-sorter.ts#L119): Retarget `// css-values-4 #keywords` -> `// css-syntax-3 #consume-declaration: standard property names are ASCII case-insensitive`.
24. **`CH-R24`** [`src/cascade/rule-filter.ts:871-872`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/rule-filter.ts#L871-L872): Retarget `// css-nesting-1 #the-cssnestrule` -> `// css-nesting-1 #nesting-at-scope: '&' in @scope behaves like :where(:scope) with (0, 0, 0) specificity`.
25. **`CH-R25`** [`src/cascade/color-resolver.ts:182`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/color-resolver.ts#L182): Retarget `// css-color-4 #resolving-color-values` -> `// css-color-4 #resolving-sRGB-values`.
26. **`CH-R26`** [`src/cascade/computed-style.ts:236,275`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/computed-style.ts#L236): Remove non-vendored `css21 #clipping-properties` on line 236 (keep `// css-masking-1 #clip-property`) and retarget `#default` on line 275 -> `// css-cascade-5 #defaulting-keywords`.
27. **`CH-R27`** [`src/MediaParser.ts:32-41`](file:///usr/local/google/home/paulirish/code/cssom/src/MediaParser.ts#L32-L41): Consolidate generic 4-anchor stack on `class MediaParser` and retarget `parse` to `// mediaqueries-4 #mq-syntax: parse a <media-query-list> production`.
28. **`CH-R28`** [`scripts/codegen/generate_logical_mappings.ts:90,106`](file:///usr/local/google/home/paulirish/code/cssom/scripts/codegen/generate_logical_mappings.ts#L90): Replace `@see https://drafts.csswg.org/css-logical-1/#...` with `// css-logical-1 #box` and `// css-logical-1 #logical-property-group`.

### B. Prune (`CH-P01` – `CH-P09` — All 9 Validated)
1. **`CH-P01`** [`src/AbstractTokenizer.ts:30,592,597,602,607,612,653`](file:///usr/local/google/home/paulirish/code/cssom/src/AbstractTokenizer.ts#L592): Delete 7 ceremonial citations on basic character predicates (`isWhitespace`, `isNewline`, `isDigit`, `isHexDigit`, `isNonPrintable`, `startsComment`) and `parseError` push helper.
2. **`CH-P02`** [`src/tokenizer.ts:53,70,85`](file:///usr/local/google/home/paulirish/code/cssom/src/tokenizer.ts#L53): Delete redundant `#tokenization` and trivial cursor getter/helper `#next-input-code-point` comments.
3. **`CH-P03`** [`src/TokenStream.ts:28,37,52,61,66,96,105,131`](file:///usr/local/google/home/paulirish/code/cssom/src/TokenStream.ts#L28): Delete 8 ceremonial `#parser-definitions` comments on internal stream cursor methods (`next()`, `peek()`, `position`).
4. **`CH-P04`** [`src/css-escape.ts:22,29,36,43,50,57,71`](file:///usr/local/google/home/paulirish/code/cssom/src/css-escape.ts#L22): Delete 7 per-branch repeats of `// cssom-1 #serialize-an-identifier` inside `escape()`.
5. **`CH-P05`** [`src/CSSOM.ts:139`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSOM.ts#L139), [`src/rules/collections.ts:39,65,155`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/collections.ts#L39), [`src/rules/base.ts:62,67,126`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/base.ts#L62), [`src/CSSStyleDeclaration.ts:126,592`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L126), [`src/rules/at-rules.ts:46,51-52,111,502-503,608,635,666,679,743,746`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/at-rules.ts#L46): Delete ceremonial interface/attribute citations on `[Symbol.toStringTag]` and 1-line trivial WebIDL getters/setters.
6. **`CH-P06`** [`src/specificity.ts:113,116,120,123,126`](file:///usr/local/google/home/paulirish/code/cssom/src/specificity.ts#L113) & [`src/matcher.ts:310-313,333-335`](file:///usr/local/google/home/paulirish/code/cssom/src/matcher.ts#L310-L313): Delete per-case repeat citations inside `calculateSpecificity` and `matchSimpleSelector`.
7. **`CH-P07`** [`src/typed-om/numeric/CSSNumericValue.ts:23`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/numeric/CSSNumericValue.ts#L23), [`src/typed-om/numeric/numeric-methods.ts:555`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/numeric/numeric-methods.ts#L555), [`src/typed-om/transform/CSSTransformValue.ts:51`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/transform/CSSTransformValue.ts#L51): Delete redundant/ceremonial comments on abstract base class, prototype wiring helper, and index proxy.
8. **`CH-P08`** [`src/cascade/types.ts:26-28,46-68`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/types.ts#L26-L68): Delete ceremonial anchor lines on TypeScript interface `MatchedDeclaration` and `CascadeOrigin`.
9. **`CH-P09`** [`src/cascade/cascade-sorter.ts:31,47,64,70,86,91`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/cascade-sorter.ts#L31-L91), [`src/cascade/layer-manager.ts:60-61,115-140`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/layer-manager.ts#L115-L140), [`src/cascade/color-resolver.ts:21,193,202,208,241,252`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/color-resolver.ts#L193), [`src/cascade/computed-style.ts:255,263,267`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/computed-style.ts#L255), [`src/cascade/variable-resolver.ts:656`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/variable-resolver.ts#L656): Delete per-branch duplicate citations inside functions already cited at their entry point.

### C. Add (High Bar Only — `14` Validated, `CH-A10` Rejected + 4 Sub-Items Trimmed by Scrutineer)
1. **`CH-A01`** [`src/CSSStyleDeclaration.ts:632`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L632): Add `// cssom-1 #dom-cssstyledeclaration-removeproperty` on `removeProperty()`.
2. **`CH-A02`** [`src/rules/collections.ts:99,112`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/collections.ts#L99): Add `// cssom-1 #dom-medialist-appendmedium` and `// cssom-1 #dom-medialist-deletemedium`.
3. **`CH-A03`** [`src/CSSOM.ts:428,442`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSOM.ts#L428): Add `// cssom-1 #legacy-css-style-sheet-members: addRule returns -1; removeRule forwards to deleteRule`.
4. **`CH-A04`** [`src/serializer.ts:947`](file:///usr/local/google/home/paulirish/code/cssom/src/serializer.ts#L947): Add `// css-syntax-3 #serializing-anb` on `formatAnPlusB`.
5. **`CH-A05`** [`src/parser.ts:1079`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L1079): Add `// css-syntax-3 #consume-unicode-range-value: re-tokenizes raw value with unicodeRangesAllowed=true`.
6. **`CH-A06`** [`src/SelectorParser.ts:675,727`](file:///usr/local/google/home/paulirish/code/cssom/src/SelectorParser.ts#L675): Add `// selectors-4 #relational: :has() cannot be nested within :has() and forbids pseudo-elements` and `// selectors-4 #the-nth-child-pseudo: 'of' clause requires <complex-real-selector-list>, forbidding pseudo-elements and relative combinators`.
7. **`CH-A07`** [`src/matcher.ts:1042`](file:///usr/local/google/home/paulirish/code/cssom/src/matcher.ts#L1042): Add `// html #the-lang-and-xml:lang-attributes: determine element language with xml:lang namespace precedence` on `getElementLanguage`.
8. **`CH-A08`** [`src/typed-om/values/style-value-parser.ts:117,410`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/values/style-value-parser.ts#L117), [`src/typed-om/numeric/numeric-methods.ts:73,274`](file:///usr/local/google/home/paulirish/code/cssom/src/typed-om/numeric/numeric-methods.ts#L73), [`src/math-parser.ts:741`](file:///usr/local/google/home/paulirish/code/cssom/src/math-parser.ts#L741): Add algorithm entry point citations (`#parse-a-cssstylevalue`, `#create-a-sum-value`, `#dom-cssnumericvalue-parse`, `css-values-4 #sort-a-calculations-children`).
9. **`CH-A09`** [`src/PropertyRegistry.ts:53,87,298`](file:///usr/local/google/home/paulirish/code/cssom/src/PropertyRegistry.ts#L53): Add algorithm entry point citations (`#consume-syntax-definition`, `#consume-syntax-component`, `#register-a-custom-property: WPT enforces Level 1 required inherits and non-universal initialValue`).
10. **`CH-A11`** [`src/rules/at-rules.ts:458`](file:///usr/local/google/home/paulirish/code/cssom/src/rules/at-rules.ts#L458) & [`src/cascade/rule-filter.ts:852`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/rule-filter.ts#L852): Add `// css-nesting-1 #the-cssnestrule` and `// css-nesting-1 #nested-declarations` *(Scrutineer pruned `src/walk.ts:87` as internal walker plumbing)*.
11. **`CH-A12`** [`src/cascade/rule-filter.ts:90`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/rule-filter.ts#L90) & [`src/cascade/index.ts:235`](file:///usr/local/google/home/paulirish/code/cssom/src/cascade/index.ts#L235): Add invariants (`css-cascade-5 #stages`, `css-writing-modes-4 #text-orientation`) *(Scrutineer pruned `layer-manager.ts:84` as already cited at L74)*.
12. **`CH-A13`** [`src/MediaParser.ts:77,670,861`](file:///usr/local/google/home/paulirish/code/cssom/src/MediaParser.ts#L77): Add `// mediaqueries-4 #evaluating`, `cssom-1 #serializing-media-queries`, and `// mediaqueries-4 #mq-range-context: false in negative range` *(Scrutineer pruned `MediaParser.ts:460`)*.
13. **`CH-A14`** [`src/parser-api.ts:502`](file:///usr/local/google/home/paulirish/code/cssom/src/parser-api.ts#L502) & [`src/parser.ts:141`](file:///usr/local/google/home/paulirish/code/cssom/src/parser.ts#L141): Add `// css-conditional-3 #the-css-namespace` and `// css-conditional-3 #at-supports` *(Scrutineer pruned internal sub-helpers `parser-api.ts:423,465`)*.
14. **`CH-A15`** [`src/CSSStyleDeclaration.ts:292`](file:///usr/local/google/home/paulirish/code/cssom/src/CSSStyleDeclaration.ts#L292) & [`src/shorthands.ts:493,1430`](file:///usr/local/google/home/paulirish/code/cssom/src/shorthands.ts#L493): Add `// css-logical-1 #box`, `// css-logical-1 #logical-shorthand-keyword`, and `// css-logical-1 #border-shorthands`.

---

## Part 3: Invalidated / Rejected Auditor Claims (`Scrutineer` + Empirical WPT Verification)

1. **`BC-03` (`CSS.escape` $\ge$ `U+0080`) — INVALID**: WPT `css/cssom/escape.html:83-91` and all browsers explicitly assert `CSS.escape('\x80...')`, `CSS.escape('\xA0...')`, and lone surrogates are preserved unescaped.
2. **`BC-06` (`deleteRuleFromArray` `@namespace` check) — INVALID**: `@namespace` rules cannot syntactically exist inside `CSSGroupingRule` per `css-namespaces-3 #syntax`; `CSSStyleSheet.prototype.deleteRule` (`src/CSSOM.ts:404-408`) already enforces step 4.
3. **`BC-11` (`|E` and `|*` `element.namespaceURI !== 'http://www.w3.org/1999/xhtml'`) — INVALID (Linkedom Compatibility Invariant)**: In `linkedom`, `document.createElementNS(null, 'x').namespaceURI` and un-namespaced XML elements return `'http://www.w3.org/1999/xhtml'` instead of `null`. Removing this check breaks null-namespace matching on `linkedom` DOM nodes. Document as a Trigger #3 citation note in `src/matcher.ts:321`.
4. **`BC-13` (`:lang()` non-initial wildcard subtags) — INVALID**: `selectors-4 #the-lang-pseudo` references RFC 4647 § 3.3.2 extended filtering, which explicitly allows `*` in any subtag position (`de-*-DE`).
5. **`BC-14` (`CSSVariableReferenceValue` fallback space) — INVALID**: WPT `css/css-typed-om/stylevalue-serialization/cssUnparsedValue.html` explicitly asserts `'var(--A,var(--B))var(--C)'` without space after comma.
6. **`BC-15` (`CSSKeywordValue.toString()` escaping) — INVALID**: WPT `css/css-typed-om/stylevalue-serialization/cssKeywordValue.tentative.html` explicitly asserts `new CSSKeywordValue(' Hello World').toString() === CSS.escape(' Hello World')`.
7. **`BC-16` (`CSSUnparsedValue.toString()` `/**/` insertion) — INVALID**: WPT `css/css-typed-om/stylevalue-serialization/cssUnparsedValue.html` explicitly asserts `new CSSUnparsedValue(['lem', 'on', 'ade']).toString() === 'lem/**/on/**/ade'`.
8. **`BC-17` (`CSSMathSum`/`CSSMathProduct` `sortNumericNodes`) — INVALID**: `sortNumericNodes` implements `css-values-4 #sort-a-calculations-children` required by calculation tree serialization tests.
9. **`BC-18` (`CSSUnitValue` unit casing) — INVALID**: WPT `css/css-typed-om/stylevalue-subclasses/numeric-objects/cssUnitValue.html` explicitly asserts `assert_equals(result.unit, unit.toLowerCase())`.
10. **`BC-19` & `BC-20` (`PropertyRegistry` `inherits` and `initialValue` requiredness) — INVALID**: WPT `css/css-properties-values-api/register-property.html` and `at-property.html` explicitly assert `"registerProperty requires inherits"` (`TypeError`) and `"registerProperty only allows omitting initialValue if syntax is '*'"` (`SyntaxError`).
