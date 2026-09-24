# Architecture & Codebase Map

High-level architecture guide for contributors and agents working on `cssomnom`.

## Pipeline End-to-End

```
CSS Text
  │
  ▼ [tokenizer.ts / AbstractTokenizer.ts / TokenStream.ts]
Token Stream
  │
  ▼ [parser.ts] (consumes rules, blocks, declarations; uses PropertyRegistry.ts)
AST & CSSOM Objects [CSSOM.ts, rules/, CSSStyleDeclaration.ts]
  │
  ├──► Serialization [serializer.ts, shorthands.ts] ──► Spec-compliant CSS Text
  │
  ├──► Cascade & Computed Styles [cascade/]
  │      ├─ rule-filter.ts (collects & filters rules via matcher.ts & SelectorParser.ts)
  │      ├─ UA Stylesheet (data/gen/ua-stylesheet.ts entered via getCascadedStyle)
  │      ├─ layer-manager.ts (@layer sorting) & at-rule-manager.ts (@property, @keyframes)
  │      ├─ cascade-sorter.ts (origin, importance, layer, specificity, source order)
  │      ├─ variable-resolver.ts (var(), env(), registered property inheritance)
  │      ├─ color-resolver.ts (system colors, color spaces, relative color syntax)
  │      └─ computed-style.ts (CSSComputedStyleDeclaration resolving to computed values)
  │
  ├──► Typed OM [typed-om/] (CSSStyleValue hierarchy, numeric/math, transforms, style-map)
  │
  └──► Selectors & Queries [SelectorParser.ts, specificity.ts, matcher.ts]
```

## Directory & Module Ownership

- [`src/index.ts`](./src/index.ts): Main public entry point exporting `parse`, `tokenize`, `serialize`, `getCascadedStyle`, `matches`, `CSSStyleDeclaration`, and CSSOM classes.
- [`src/browser-entry.ts`](./src/browser-entry.ts): Browser polyfill bundle entry exposing CSSOM/Typed OM onto `window` with WebIDL constructor arities.
- [`src/tokenizer.ts`](./src/tokenizer.ts) & [`src/AbstractTokenizer.ts`](./src/AbstractTokenizer.ts): CSS Syntax 3 tokenization engine and character preprocessing.
- [`src/streaming-tokenizer.ts`](./src/streaming-tokenizer.ts): Incremental streaming tokenizer emitting tokens chunk-by-chunk.
- [`src/TokenStream.ts`](./src/TokenStream.ts): Cursor abstractions (`ArrayTokenStream`, `LazyComponentValueStream`) over token arrays.
- [`src/types.ts`](./src/types.ts): Central TypeScript definitions for tokens, component values, AST nodes, and rules.
- [`src/parser.ts`](./src/parser.ts): Recursive descent parser for stylesheets, rules, declarations, and component values.
- [`src/parse-hooks.ts`](./src/parse-hooks.ts): Dependency inversion interface breaking cycles between core parser, CSSOM, and Typed OM.
- [`src/CSSOM.ts`](./src/CSSOM.ts): Standard CSSOM Level 1 tree objects (`StyleSheet`, `CSSStyleSheet`, `CSSRuleList`, `MediaList`).
- [`src/CSSStyleDeclaration.ts`](./src/CSSStyleDeclaration.ts): Declaration block interface, property reflection proxy, and shorthand synchronization.
- [`src/rules/`](./src/rules/): Specialized CSSOM rule classes:
  - [`rules/base.ts`](./src/rules/base.ts): `CSSRule` base class, constants, and `CSSGroupingRule`.
  - [`rules/at-rules.ts`](./src/rules/at-rules.ts): Concrete at-rules (`CSSMediaRule`, `CSSSupportsRule`, `CSSKeyframesRule`, etc.).
  - [`rules/collections.ts`](./src/rules/collections.ts): Indexed collections (`StyleSheetList`, `CSSRuleList`, `MediaList`).
  - [`rules/utils.ts`](./src/rules/utils.ts): Rule grouping serializers and descriptor validation sets.
- [`src/serializer.ts`](./src/serializer.ts): Spec-compliant CSS serialization for tokens, identifiers, strings, declarations, and selectors.
- [`src/shorthands.ts`](./src/shorthands.ts): Expansion and contraction logic for CSS shorthand properties.
- [`src/SelectorParser.ts`](./src/SelectorParser.ts): Selectors Level 4 AST parser (`ComplexSelector`, `CompoundSelector`, forgiving lists).
- [`src/specificity.ts`](./src/specificity.ts): Specificity calculation `[A, B, C]` and comparisons.
- [`src/matcher.ts`](./src/matcher.ts): DOM element selector matching engine (`matches`, `querySelector`, `querySelectorAll`).
- [`src/MediaParser.ts`](./src/MediaParser.ts): Media Queries Level 4/5 parser and 3-valued boolean environment evaluator.
- [`src/math-parser.ts`](./src/math-parser.ts): CSS Math parser and simplifier (`calc()`, `min()`, `max()`, `clamp()`, `round()`).
- [`src/DOMMatrix.ts`](./src/DOMMatrix.ts): Geometry API matrix transformation and decomposition implementation.
- [`src/PropertyRegistry.ts`](./src/PropertyRegistry.ts): Houdini `@property` and `CSS.registerProperty()` syntax validator and registry.
- [`src/parser-api.ts`](./src/parser-api.ts): WICG CSS Parser API and `CSS.*` utility namespace (`CSS.escape`, `CSS.supports`).
- [`src/webidl.ts`](./src/webidl.ts): WebIDL prototype descriptors, brand checks, arity enforcement, and constants.
- [`src/cascade/`](./src/cascade/): Cascade resolution and computed style engine:
  - [`cascade/index.ts`](./src/cascade/index.ts): Main pipeline orchestration for `getCascadedStyle()`.
  - [`cascade/rule-filter.ts`](./src/cascade/rule-filter.ts): Rule harvesting, media query filtering, and selector matching.
  - [`cascade/cascade-sorter.ts`](./src/cascade/cascade-sorter.ts): CSS Cascade 5 declaration comparator (origin, importance, layer, specificity).
  - [`cascade/layer-manager.ts`](./src/cascade/layer-manager.ts): `@layer` declaration ordering and nested layer trees.
  - [`cascade/at-rule-manager.ts`](./src/cascade/at-rule-manager.ts): Active `@property` and `@keyframes` discovery across layers.
  - [`cascade/variable-resolver.ts`](./src/cascade/variable-resolver.ts): CSS custom property resolution, cycle detection, and fallback handling.
  - [`cascade/color-resolver.ts`](./src/cascade/color-resolver.ts): CSS Color 4 color space resolution and system colors.
  - [`cascade/value-processor.ts`](./src/cascade/value-processor.ts): Standard property processing and initial value fallback.
  - [`cascade/computed-style.ts`](./src/cascade/computed-style.ts): `CSSComputedStyleDeclaration` resolving computed property values.
  - [`cascade/types.ts`](./src/cascade/types.ts): Cascade types (`MatchedDeclaration`, `CascadeOrigin`).
- [`src/typed-om/`](./src/typed-om/): CSS Typed OM Level 1 & 2 implementation:
  - [`typed-om/values/`](./src/typed-om/values/): Style values (`CSSStyleValue`, `CSSKeywordValue`, `CSSImageValue`, `CSSUnparsedValue`).
  - [`typed-om/numeric/`](./src/typed-om/numeric/): Numeric values (`CSSUnitValue`, `CSSMathValue`, math expressions, type math).
  - [`typed-om/color/`](./src/typed-om/color/): Typed colors (`CSSRGB`, `CSSHSL`, `CSSLab`, `CSSOKLCH`, `CSSColorValue`).
  - [`typed-om/transform/`](./src/typed-om/transform/): Matrix and 3D transform components (`CSSTranslate`, `CSSRotate`, `CSSTransformValue`).
  - [`typed-om/position/`](./src/typed-om/position/): `CSSPositionValue`.
  - [`typed-om/style-map/`](./src/typed-om/style-map/): Map interfaces (`StylePropertyMapReadOnly`, `StylePropertyMap`).
- [`src/data/gen/`](./src/data/gen/): Generated data modules produced by `scripts/codegen/`.
- [`scripts/codegen/`](./scripts/codegen/): Codegen scripts deriving properties, syntaxes, colors, units, and UA styles from `@webref` and MDN.

## Key Invariants and Seams

- **ParseHooks Dependency Inversion**:
  To prevent circular imports between the parser (`src/parser.ts`) and CSSOM/Typed OM layers (`src/CSSOM.ts`, `src/typed-om.ts`), `src/parse-hooks.ts` declares hook signatures that throw by default. At bootstrap, `src/parser.ts` injects concrete implementations into `ParseHooks` (`ParseHooks.consumeRule = ...`, `ParseHooks.parseStyleAttribute = ...`). Never import `Parser` directly into `src/CSSOM.ts` or `src/typed-om/`.
- **Public Entry Points**:
  - `src/index.ts`: Primary library entry point for Node.js and bundlers.
  - `src/browser-entry.ts`: Browser environment entry point exposing globals with WebIDL property descriptors.
- **UA Stylesheet Entry into Cascade**:
  The HTML User Agent stylesheet text is generated into `src/data/gen/ua-stylesheet.ts` from WHATWG HTML. In `src/cascade/index.ts` within `getCascadedStyle()`, it is lazily parsed via `ParseHooks.consumeListOfRules(tokenize(HTML_UA_STYLESHEET_TEXT), true)` and collected under `'user-agent'` origin with default (empty) layer ordering, running before author rules.
- **Test Layout & Harness**:
  - `tests/`: Pure in-memory unit tests (`pnpm test:node`). Must never spawn child processes.
  - `tests/dom-shim/`: In-memory DOM polyfill (built on LinkeDOM) for running DOM-dependent tests and WPT harnesses in Node.js.
  - `scripts/wpt/node/`: WPT harness running official Web Platform Tests in Node.js (`cli.ts`, `run.ts`). Uses `safe-child-process.ts` to strictly govern child workers with memory caps (`--max-old-space-size=512`) and RSS watchdogs.
- **Codegen Flow**:
  Running `pnpm run codegen` executes `scripts/codegen/generate_all.ts`, which runs all standalone generators in `scripts/codegen/` to output TypeScript files under `src/data/gen/`. Never edit files in `src/data/gen/` manually.

## Where Do I Look For...

| Task | Primary Locations |
| :--- | :--- |
| **Add or fix a CSS property** | `scripts/codegen/generate_properties.ts`, `scripts/codegen/generate_standard_syntax.ts`, `src/PropertyRegistry.ts`, `src/CSSStyleDeclaration.ts` |
| **Fix shorthand expansion/contraction** | `src/shorthands.ts`, `scripts/codegen/generate_shorthands.ts`, `src/data/gen/shorthands.ts` |
| **Fix serialization** | `src/serializer.ts` (`serialize`, `serializeIdentifier`, `serializeDeclarations`, `serializeSelectorList`) |
| **Fix selector parsing or matching** | `src/SelectorParser.ts` (parsing), `src/specificity.ts` (specificity), `src/matcher.ts` (matching elements) |
| **Fix cascade or computed values** | `src/cascade/index.ts` (flow), `src/cascade/computed-style.ts` (values), `src/cascade/cascade-sorter.ts` (sorting), `src/cascade/variable-resolver.ts` (`var()`) |
| **Fix an at-rule** | `src/rules/at-rules.ts` (CSSOM class), `src/parser.ts` (`consumeAtRule`), `src/cascade/at-rule-manager.ts` (cascade discovery) |
| **Fix media query parsing/evaluation** | `src/MediaParser.ts`, `scripts/codegen/generate_media_features.ts`, `src/data/gen/media-features.ts` |
| **Fix Typed OM objects or math** | `src/typed-om/` (values, transforms, colors), `src/math-parser.ts`, `src/DOMMatrix.ts` |
| **Update generated data** | `scripts/codegen/` (generators), `scripts/codegen/generate_all.ts` (`pnpm run codegen`) |
