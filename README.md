# cssomnom

[![npm version](https://img.shields.io/npm/v/cssomnom.svg)](https://www.npmjs.com/package/cssomnom)

A high-performance, zero-dependency, spec-compliant CSS Object Model (CSSOM) parser and query engine in pure TypeScript. Purpose-built for static analysis, testing, and eating style rules for breakfast.

_Built with coding agents against 23,000+ W3C Web Platform Tests (WPT) across CSSOM, Syntax, Selectors, Cascade, Variables, Nesting, Media Queries, and Typed OM. Coding agents + conformance suites is a really fun meta-project (I recommend it!)._

## Why cssomnom?

Other tools like PostCSS and CSSTree expose custom Abstract Syntax Trees (ASTs) that require learning tool-specific APIs to navigate. 

`cssomnom` implements the standard **W3C CSS Object Model (CSSOM)** API. You get a familiar, standardized interface to query styles directly in Node.js. For example, you can use `stylesheet.cssRules[0].style.getPropertyValue('color')` instead of writing complex AST traversal code.

It is uniquely suited for **static analysis** and **automated grading** where you need to evaluate CSS rules against DOM structures without the overhead of a full browser environment.

## Features

*   **Full Spec Compliance**: Implements CSS Syntax Module Level 3, CSSOM Level 1, CSS Nesting, CSS Logical Properties, and Houdini specifications (Properties and Values API, Typed OM Level 1 & 2).
*   **Cascade Resolution**: Query which styles apply to a mock element without a real DOM using `getCascadedStyle`.
*   **Houdini Powered**: Full support for `CSS.registerProperty()`, `CSSNumericValue.parse()`, and complex math functions (e.g., `calc`, `sin`, `atan2`).
*   **Fast and Buildless-Ready**: Executes directly in Node.js 24.11.0+ without a build step for development, or can be consumed as a pre-bundled ESM package.

## API Documentation & Quickstarts

### Subpath Exports & Import Options

`cssomnom` provides focused subpath entrypoints depending on what you need:

```typescript
// 1. Full Package ("cssomnom"): Browser CSSOM, Typed OM, W3C CSS namespace, Cascade & Node AST tools
import { parse, getCascadedStyle, CSSNumericValue, CSS } from 'cssomnom';

// 2. Lightweight Parser & CSSOM Subset ("cssomnom/parse" — ~338 KB, >60% smaller bundle!)
// Minimal subset of "cssomnom" excluding Cascade, UA Stylesheet, and Typed OM; ideal for DOM shims (LinkeDOM) and workers
import { parse, CSSStyleSheet, CSSStyleDeclaration } from 'cssomnom/parse';

// 3. WICG CSS Parser API Draft ("cssomnom/parser-api")
import { parseStylesheet, parseRule, CSSParserAtRule, CSSParserQualifiedRule } from 'cssomnom/parser-api';
```

### Basic CSS Parsing & Rule Traversal

Parse CSS into a standard `CSSStyleSheet` and traverse rules like `CSSStyleRule`, `CSSMediaRule`, and `CSSNestedDeclarations`.

```typescript
import { parse, type CSSStyleRule, type CSSMediaRule } from 'cssomnom';

const css = `
  body { color: red; }
  @media (max-width: 600px) {
    body { 
      color: blue;
      margin: 0;
    }
  }
`;

const stylesheet = parse(css);

// Access a basic style rule
const bodyRule = stylesheet.cssRules[0] as CSSStyleRule;
console.log(bodyRule.style.getPropertyValue('color')); // 'red'

// Access nested rules (like inside an @media block)
const mediaRule = stylesheet.cssRules[1] as CSSMediaRule;
const nestedBodyRule = mediaRule.cssRules[0] as CSSStyleRule;
console.log(nestedBodyRule.style.getPropertyValue('margin')); // '0'
```

### Static Analysis Traversal & Property Indexing (`getRules`, `closestRule`, `resolveSelector`, `parseSelectorAST`, `getDeclaredProperties`, `getPropertyValues`)

Use `getRules`, `closestRule`, `resolveSelector`, `parseSelectorAST`, `getDeclaredProperties`, and `getPropertyValues` to inspect stylesheets using standard CSSOM instances without custom wrapper objects or hand-rolled recursive visitors:

```typescript
import {
  parse,
  getRules,
  closestRule,
  resolveSelector,
  parseSelectorAST,
  getDeclaredProperties,
  getPropertyValues,
  CSSStyleRule,
  CSSMediaRule,
} from 'cssomnom';

const css = `
  .card {
    border: 1px solid var(--accent);
    margin-inline-start: 1rem;
    grid-template-rows: auto;
    grid-template-rows: subgrid;
    @media (min-width: 600px) {
      color: blue;
      & .title { font-weight: bold; }
    }
  }
  @supports (interpolate-size: allow-keywords) {
    :root { interpolate-size: allow-keywords; }
  }
`;

const sheet = parse(css);

// 1. Collect all CSSStyleRule instances (or omit the filter class to get all CSSRule instances)
for (const rule of getRules(sheet, CSSStyleRule)) {
  console.log({
    rawSelector: rule.selectorText,                    // '.card', '& .title', ':root'
    resolvedSelector: resolveSelector(rule),           // '.card', ':is(.card) .title', ':root'
    selectorAST: parseSelectorAST(rule),               // Selectors Level 4 SelectorList AST (with '&' resolved)
    media: closestRule(rule, CSSMediaRule)?.conditionText ?? null, // null, '(min-width: 600px)', null
    line: rule.location?.line,                         // 1-based line number
    rows: getPropertyValues(rule, 'grid-template-rows'), // ['auto', 'subgrid'] (preserves fallback order!)
    marginLeft: getPropertyValues(rule, 'margin-left'),  // ['1rem'] (resolves logical↔physical aliases!)
    borderColor: getPropertyValues(rule, 'border-color'), // ['1px solid var(--accent)'] (inspects var() shorthands!)
  });
}

// 2. Collect every declared property across the stylesheet (longhands, parent shorthands, and @supports features)
const props = getDeclaredProperties(sheet);
console.log(props.has('border'));           // true (parent shorthand indexed alongside border-top-width, etc.)
console.log(props.has('border-color'));     // true
console.log(props.has('interpolate-size')); // true (from both style rules and @supports conditions)
```

### CSS Typed OM

Parse and manipulate CSS values directly as objects instead of strings using the CSS Typed OM API.

```typescript
import { CSSNumericValue, CSSUnitValue, CSS } from 'cssomnom';

// Parse values
const length = CSSNumericValue.parse('10px');
console.log(length instanceof CSSUnitValue); // true
console.log(length.value); // 10
console.log(length.unit); // 'px'

// Use factory methods
const width = CSS.px(100);
const padding = CSS.rem(2);

// Complex mathematical operations
const calcValue = CSSNumericValue.parse('calc(1in + 96px)');
console.log(calcValue.toString()); // '192px' (canonicalizes to px)

const angle = CSSNumericValue.parse('calc(45deg + 0.25turn)');
console.log(angle.toString()); // '135deg'

// Note: Complex math functions (trigonometric, exponential, stepped) remain as
// tree-structured CSSMathValue objects in the Typed OM specified style rather
// than collapsing to a single scalar, preserving the calculation tree for
// computed-value time resolution per css-values-4 #calc-internal.
```

### CSS Custom Properties & Houdini

Register custom properties with syntax validation and evaluate support for features.

```typescript
import { CSS } from 'cssomnom';

// Register custom properties with syntax validation
CSS.registerProperty({
  name: '--main-color',
  syntax: '<color>',
  inherits: false,
  initialValue: 'red'
});

// Check feature support
if (CSS.supports('display', 'grid')) {
  console.log('Grid is supported!');
}
if (CSS.supports('(transform-origin: 5% 5%)')) {
  console.log('Conditional supports rule allowed');
}
```

### Static Analysis & Cascade Resolution

Compute the cascaded style for a particular element. You can pair `cssomnom` with lightweight DOM implementations like `linkedom` to resolve styles against HTML.

```typescript
import { parse, getCascadedStyle } from 'cssomnom';
import { parseHTML } from 'linkedom';

const html = `
  <div class="box highlight">Hello World</div>
`;
const css = `
  .box { color: red; }
  .box.highlight { color: blue; }
`;

const { document } = parseHTML(html);
const element = document.querySelector('.box');

const stylesheet = parse(css);
const style = getCascadedStyle(element, stylesheet);
const mobileStyle = getCascadedStyle(element, stylesheet, { width: 480 });

console.log(style.getPropertyValue('color')); // 'blue'
```

### Low-level Tokenization, Serialization, and StreamingTokenizer

For performance-critical tasks, skip the high-level object model and work directly with tokens. 

```typescript
import { tokenize, serialize, StreamingTokenizer } from 'cssomnom';

const cssText = '.btn { color: #fff; }';

// 1. Direct Tokenization
const tokens = tokenize(cssText);
console.log(tokens.length); // Outputs total number of tokens

// 2. Serialization (back to string)
const output = serialize(tokens);
console.log(output === cssText); // true

// 3. Streaming Tokenization (Memory Efficient)
const tokenizer = new StreamingTokenizer();
tokenizer.appendChunk('.btn { col');
tokenizer.appendChunk('or: #fff; }');
const streamingTokens = tokenizer.getTokens();
console.log(streamingTokens);
```

## API Reference Summary

This library implements standard W3C CSSOM interfaces (refer to [MDN Web Docs on CSSOM](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Object_Model)).

Below are the primary entry points and custom utilities:

*   **`parse(css: string, options?: ParserOptions): CSSStyleSheet`** — Parses a CSS string directly into a `CSSStyleSheet`.
*   **`tokenize(css: string): Token[]`** — Synchronous low-level tokenizer.
*   **`serialize(nodes: ComponentValue[] | Token[]): string`** — Serializes component values or tokens back to CSS text.
*   **`new StreamingTokenizer()`** — Class for processing chunked CSS streams.
*   **`getRules(root, RuleClass?)`** — Recursively collects rules in depth-first pre-order across a `CSSStyleSheet`, `CSSRule`, or `Iterable<CSSRule>`, optionally narrowed to instances of `RuleClass` (e.g. `getRules(sheet, CSSStyleRule)`).
*   **`closestRule(rule, ...RuleClasses)`** — Walks strict ancestors via `rule.parentRule` and returns the nearest enclosing rule matching any of `RuleClasses` (e.g. `closestRule(rule, CSSMediaRule)`).
*   **`resolveSelector(rule)`** — Resolves CSS Nesting `&` combinators and relative selectors across enclosing `CSSStyleRule` and `@scope` ancestors into a canonical selector string.
*   **`parseSelectorAST(input, options?)`** — Parses a selector string or `CSSRule` into a Selectors Level 4 `SelectorList` AST (resolving nested `&` selectors by default when given a `CSSRule`).
*   **`getDeclaredProperties(root, options?)`** — Collects all declared CSS property names across the rule tree, including parent shorthands and `@supports` feature queries.
*   **`getPropertyValues(target, property, options?)`** — Returns all authored values for `property` in declaration order on a `CSSRule` or `CSSStyleDeclaration`, resolving logical↔physical property aliases, unexpanded `var()` shorthands, and same-rule progressive-enhancement fallbacks.
*   **`calculateSpecificity(selector: string | SelectorList)`** — Calculates selector specificity tuple `[a, b, c]`.
*   **`getCascadedStyle(element, rulesOrSheet?, pseudoOrEnv?, envOptions?)`** — Computes cascaded styles against a DOM/linkedom element (accepting a `CSSStyleSheet` or rule list, plus optional `Partial<MediaEnvironment>` overrides).
*   **`resolveVariables(style: CSSStyleDeclaration, property: string, envMap?)`** — Resolves `var()` and `env()` substitutions on a `CSSStyleDeclaration`.

## Architecture & Spec Boundaries

This section outlines the boundaries between standard CSSOM specifications (`src/entry/spec.ts`) and standalone Node tooling (`src/entry/tools.ts`).

### 1. Standard CSSOM Layer (`src/entry/spec.ts`)
These APIs are defined in the [CSSOM-1](https://drafts.csswg.org/cssom-1/) specification and related module extensions (CSS Conditional Rules, CSS Nesting, CSS Anchor Positioning, CSS Fonts, CSS Animations, CSS Paged Media, CSS View Transitions, and CSS Cascade). They are designed to mirror standard browser CSSOM APIs in Node.js and headless environments, and are verified bidirectionally against W3C WebIDL definitions via `webidl2.js` in [`tests/api-surface.test.ts`](./tests/api-surface.test.ts).

**Interfaces & Classes**
- **Base Hierarchy & Collections**: `StyleSheet`, `CSSStyleSheet`, `StyleSheetList`, `CSSRule`, `CSSRuleList`, `CSSGroupingRule`, `MediaList`, `LinkStyle` (TypeScript interface)
- **Style Rules & Nesting**: `CSSStyleRule`, `CSSNestedDeclarations`
- **Conditional & Grouping Rules**: `CSSConditionRule`, `CSSMediaRule`, `CSSSupportsRule`, `CSSContainerRule`, `CSSLayerBlockRule`, `CSSLayerStatementRule`, `CSSScopeRule`, `CSSStartingStyleRule`
- **Specialized Rules**: `CSSFontFaceRule`, `CSSPageRule`, `CSSPositionTryRule`, `CSSMarginRule`, `CSSKeyframesRule`, `CSSKeyframeRule`, `CSSNamespaceRule`, `CSSImportRule`, `CSSPropertyRule`, `CSSCounterStyleRule`, `CSSFontFeatureValuesRule`, `CSSViewTransitionRule`, `CSSCustomMediaRule`
- **Declarations & Descriptors**: `CSSStyleDeclaration`, `CSSStyleProperties`, `CSSFontFaceDescriptors`, `CSSPageDescriptors`, `CSSPositionTryDescriptors`, `CSSMarginDescriptors`, `CSSFontFeatureValuesMap`

**Deviations & Extensions**
- **Rule Constructors**: Standard CSSOM rules are typically instantiated via `insertRule()` or stylesheet parsing. `CSSStyleSheet` supports standard `CSSStyleSheetInit` options (`new CSSStyleSheet({ baseURL, media, disabled })`).
- **Synchronous `CSSStyleSheet.prototype.replace()`**: While the CSSOM-1 specification specifies parallel parsing for `replace()`, our implementation executes parsing synchronously via `replaceSync()` and returns `Promise.resolve(this)`.
- **`CSSImportRule.styleSheet`**: Evaluates to `null` because the library operates as a static, offline parser without network or disk I/O to load external stylesheets.
- **Source Location Tracking (`CSSRule.prototype.location`)**: Parsed CSS rules expose their source offsets (`{ start: number, end: number, line: number, column: number, bodyStart?: number, bodyEnd?: number }`) relative to the original source text via a non-enumerable `location` property on `CSSRule.prototype` (with 1-based `line` and `column` numbers), enabling source maps, DevTools coverage pruning, and refactoring tools without breaking standard IDL enumeration or serialization.
- **Legacy `CSSRule.type` Constants**: Numeric type constants (`STYLE_RULE = 1`, `MEDIA_RULE = 4`, etc.) are retained on `CSSRule` instances and static constructors for backward compatibility, with modern rule types evaluating to `0`.
- **CSSStyleDeclaration Host Integration**: `CSSStyleDeclaration` supports a `(parentRule?, onChange?)` constructor signature and public `onChange` callback hook (temporarily setting `decl.onChange = null` suppresses callbacks when hydrating from host DOM `style` attributes). It also provides a full Proxy supporting camelCase (`style.fontSize`), kebab-case (`style['font-size']`), `style.cssFloat`, `webkit*` prefixes, exact case preservation on `--customProperties`, and WebIDL-compliant `Object.keys(style)` returning only indexed property names `0..length-1`.
- **CSSSupportsRule Feature Evaluation**: `CSSSupportsRule.prototype.matches` returns a boolean evaluating the condition text via the conditional rules engine per CSS Conditional 4/5.
- **Single Rule Model (`CSSRule`)**: The public `Rule` type is an alias for `CSSRule`. Custom at-rules parsed via the `atRules` option with `parse()` produce `CSSAtRule` instances (exported in `src/entry/tools.ts`) exposing `.declarations` (for declaration blocks) or `.childRules` (for rule blocks) and standard `.cssText`.

---

### 2. Houdini & WICG Parser API Layer (Modern & Experimental)
These APIs expose low-level parsing, property registration, and typed values defined in Houdini and CSS Values specifications.

**Specifications Followed**
- **CSS Typed OM Level 1**: `submodules/css-houdini-drafts/css-typed-om/Overview.bs`
- **CSS Typed OM Level 2 / CSS Color API**: `submodules/css-houdini-drafts/css-typed-om-2/Overview.bs`
- **CSS Properties and Values API Level 1**: `submodules/css-houdini-drafts/css-properties-values-api/Overview.bs`
- **CSS Parser API (`cssomnom/parser-api`)**: Based on the [WICG CSS Parser API](https://github.com/WICG/css-parser-api) draft.
- **CSS Values and Units Level 4**: `submodules/csswg-drafts/css-values-4/Overview.bs` (Calculation trees, math functions, color models).

**Interfaces & Methods**
- **WICG Parser API (`import { ... } from 'cssomnom/parser-api'`)**:
    - `parseStylesheet()`, `parseRuleList()`, `parseRule()`, `parseDeclarationList()`, `parseDeclaration()`, `parseComponentValue()`, `parseValue()`, `parseValueList()`, `parseCommaValueList()`
    - Structure classes: `CSSParserValue`, `CSSParserToken`, `CSSParserBlock`, `CSSParserFunction`, `CSSParserRule`, `CSSParserAtRule`, `CSSParserQualifiedRule`, `CSSParserDeclaration`
- **Typed OM Values & Math (`import { ... } from 'cssomnom'`)**:
    - `CSSStyleValue` (base class, `CSSStyleValue.parse()`, `CSSStyleValue.parseAll()`)
    - `CSSKeywordValue`, `CSSUnparsedValue`, `CSSVariableReferenceValue`, `CSSPositionValue`, `CSSImageValue`, `CSSNumericArray`
    - `CSSNumericValue`, `CSSUnitValue`, `CSSMathValue`
    - Math subclasses: `CSSMathSum`, `CSSMathProduct`, `CSSMathNegate`, `CSSMathInvert`, `CSSMathMin`, `CSSMathMax`, `CSSMathClamp`, `CSSMathRound`, `CSSMathFunction`
    - Unit factory methods on `CSS` (`CSS.px()`, `CSS.em()`, `CSS.rem()`, `CSS.deg()`, `CSS.s()`, `CSS.Hz()`, `CSS.kHz()`, `CSS.Q()`, etc.)
- **Color Typed OM**:
    - `CSSColorValue` (base class)
    - `CSSColor`, `CSSRGB`, `CSSHSL`, `CSSHWB`, `CSSLab`, `CSSLCH`, `CSSOKLab`, `CSSOKLCH`
- **Transforms & Geometry**:
    - `CSSTransformValue`, `CSSTransformComponent`
    - Transform subclasses: `CSSTranslate`, `CSSRotate`, `CSSScale`, `CSSSkew`, `CSSSkewX`, `CSSSkewY`, `CSSPerspective`, `CSSMatrixComponent`
    - `DOMMatrix`, `DOMMatrixReadOnly`
- **Style Property Maps**:
    - `StylePropertyMap`, `StylePropertyMapReadOnly`
- **Custom Properties & Feature Detection (`CSS`)**:
    - `CSS.registerProperty()` (CSS Properties and Values API)
    - `CSS.supports()` (CSS Conditional Rules Level 3 & 4)
    - `CSS.escape()` (CSSOM Level 1)

**Deviations & Extensions**
- **String Boxing**: The spec defines `CSSToken` as `typedef (DOMString or CSSStyleValue or CSSParserValue) CSSToken;`. We box raw strings in `CSSParserToken` instead of using raw string primitives.
- **Synchronous Execution**: `parseRule`, `parseDeclarationList`, `parseDeclaration`, `parseComponentValue`, `parseValue`, `parseValueList`, and `parseCommaValueList` execute synchronously; `parseStylesheet` and `parseRuleList` accept strings or `ReadableStream`s and return a `Promise`.
- **Immutability**: Parser rule and block properties (`prelude`, `body`, `args`) are mutable TypeScript arrays rather than `FrozenArray`.
- **Constructor Arguments**: `body` is mandatory in `CSSParserQualifiedRule` constructor (`constructor(prelude, body)`).
- **CSS Values 4 Math Functions (`CSSMathFunction`)**: New math functions (`sin()`, `cos()`, `abs()`, etc.) are represented by `CSSMathFunction`. Its `operator` getter returns the function's identifier name (e.g. `'sin'`).
- **WebIDL Dictionary Bindings**: Dictionary constraints and computationally independent initial value validations for `CSS.registerProperty()` are enforced natively in JavaScript.
- **`CSSTransformComponent` Inheritance**: `CSSTransformComponent` inherits from `CSSStyleValue`, aligning with browser implementations (Blink, WebKit) and enabling reification from `CSSStyleValue.parseAll()` and `StylePropertyMap.get()`.
- **Math Simplification & Calculation Tree Preservation**: Calculation trees from `CSSNumericValue.parse()` and `StylePropertyMap` preserve `CSSMathValue` tree structures per `css-values-4 #calc-internal` rather than performing eager unit reduction at parse time.
- **Typed OM Color Property Reification**: Per `css-typed-om #reify-property`, W3C Houdini Issue [#689](https://github.com/w3c/css-houdini-drafts/issues/689), and WPT conformance tests, color properties accessed via `StylePropertyMap` (`styleMap.get('color')`, etc.) reify as generic base `CSSStyleValue` objects (with `currentcolor` and grammar keywords like `auto` on `caret-color` reifying as `CSSKeywordValue`). `CSSColorValue` subclasses (`CSSRGB`, `CSSHSL`, etc.) are exposed via `CSSColorValue.parse()`, deferring property-level color reification to Level 2 in alignment with browser engines.

---

### 3. Node Static Analysis, Cascade & Tooling Layer (`src/entry/tools.ts`)
These standalone tree-shakeable functions and classes are exported from `cssomnom` (`src/entry/tools.ts`):

**Functions & Classes**
- `parse(css, options?)`: Direct parser returning a constructable `CSSStyleSheet` (`cssomnom` and `cssomnom/parse`).
- `getRules(root, RuleClass?)`: Depth-first pre-order collector returning `CSSRule[]` (or narrowed `T[]` when `RuleClass` is passed).
- `closestRule(rule, RuleClass)`: Walks strict `rule.parentRule` ancestors to find the nearest enclosing `RuleClass` instance.
- `resolveSelector(rule)`: Resolves CSS Nesting `&` combinators and relative selectors across enclosing `CSSStyleRule` and `@scope` ancestors into a canonical selector string.
- `parseSelectorAST(input, options?)`: Parses a selector string or `CSSRule` into a Selectors Level 4 `SelectorList` AST.
- `getDeclaredProperties(root, options?)`: Collects a `Set<string>` of all declared CSS property names across the stylesheet, including parent shorthands (`border`, `border-color`, `outline`, `overflow`, `padding`, `margin`, `line-clamp`, etc.) and `@supports` feature queries (`{ includeSupports?: boolean }`, default `true`).
- `getPropertyValues(target, property, options?)`: Returns all authored values for `property` in declaration order on a `CSSRule` or `CSSStyleDeclaration`, resolving logical↔physical property aliases, unexpanded `var()` shorthands, and same-rule progressive-enhancement fallbacks.
- `calculateSpecificity(selector)`: Calculates selector specificity tuple `[a, b, c]`.
- `tokenize(text)`: Low-level tokenizer returning `Token[]`.
- `serialize(nodes)`: Low-level serializer turning component values or tokens into CSS text.
- `getCascadedStyle(element, rulesOrSheet?, pseudoOrEnv?, envOptions?)`: Computes cascaded styles against a DOM element.
- `resolveVariables(style, property, envMap?)`: Resolves `var()` and `env()` substitutions with fallback handling.
- `matches(element, selector)` / `querySelector(root, selector)` / `querySelectorAll(root, selector)`: Static selector matchers and DOM query utilities (featuring a 1,000-entry bounded LRU selector AST cache and RFC 4647 `:lang()` extended language range matching).
- `StreamingTokenizer`: Memory-efficient streaming generator tokenizer.
- `CSSAtRule`: Custom at-rule representation created when `ParserOptions.atRules` is passed to `parse()`.

**API Surface Verification**
The public API surface area is locked down and verified by [api-surface.test.ts](./tests/api-surface.test.ts). Any additions or removals of public exports must be reflected in that test to ensure intentional API changes.

---

### Parser Architecture & Upward `ParseHooks`
The core parser (`src/parser.ts`) exports standalone pure functions (`parseStyleAttribute`, `consumeRule`, `consumeListOfRules`, `parseComponentValues`, `parseSelectorAST`, `validateCustomPropertyValue`) for direct, tree-shakeable consumption by CSSOM and Typed OM modules. For upward extensibility without circular imports, `ParseHooks` (`src/parse-hooks.ts`) provides optional feature hooks (such as `createStylePropertyMap`, `supports`, and media query parsing/serialization) that higher-level modules register at bootstrap.

---

### Intentional Non-Goals & Boundaries

- **No `getComputedStyle()` Support**: We intentionally **do not** implement or expose `window.getComputedStyle()`. Resolving true computed styles requires a full visual rendering and layout engine (calculating font metrics, line heights, box-model geometry, viewport dimensions, and interaction states like `:hover` / `:focus`). In a server-side, headless Node.js environment, a partially correct `getComputedStyle()` produces subtle, misleading bugs and false confidence (**"if it cannot be completely correct, partially correct is harmful"**). Instead, `cssomnom` provides [`getCascadedStyle(element, rules)`](#static-analysis--cascade-resolution) to resolve deterministic, declarative cascade and specificity order, leaving visual layout to real browsers.
- **No Layout Guessing in Computed Values**: Layout-dependent used values (auto margins, auto min sizes, percentage positions against box size) return computed values. We do not infer layout context or fake used-value geometry without a browser layout engine.

---

**Guidelines for Maintainers**
- When adding new features, clearly identify which layer they belong to.
- Prefer implementing standard APIs (Houdini or CSSOM) over custom ones whenever possible.
- Cite spec anchors in code comments for all standard implementations.

## Web Platform Test (WPT) Conformance & Parity

`cssomnom` is evaluated against the official [W3C Web Platform Tests (WPT)](https://github.com/web-platform-tests/wpt) in pure Node.js across 8 major specification suites (CSSOM, Syntax, Nesting, Variables, Selectors, Media Queries, Cascade, and Typed OM).

<!-- WPT_PROGRESS_SUMMARY_START -->
* **W3C Standards Conformance**: **93.7%** (21,691 / 23,157 passed assertions across 1,882 test files).
* **Chrome 154 Parity**: **93.7%** pass rate across 28,773 common subtests evaluated against official [`wpt.fyi`](https://wpt.fyi) runs.

| Specification Suite | In-Scope Tests | **cssomnom** | Pass Rate | Parity vs Chrome 154 |
| :--- | :---: | :---: | :---: | :---: |
| **`Typed OM`** | 12,768 | 12,224 | **95.7%** | 🟢 **+2.2%** (ahead of Chrome) |
| **`CSSOM`** | 2,527 | 2,347 | **92.9%** | -4.3% |
| **`Nesting`** | 126 | 126 | **100.0%** | 🟢 **+0.7%** (ahead of Chrome) |
| **`Syntax`** | 418 | 412 | **98.6%** | 🟢 **+0.2%** (ahead of Chrome) |
| **`Cascade`** | 556 | 528 | **95.0%** | -4.9% |
| **`Variables`** | 501 | 466 | **93.0%** | 🟢 **+2.5%** (ahead of Chrome) |
| **`Selectors`** | 5,842 | 5,178 | **88.6%** | 🟢 **+2.7%** (ahead of Chrome) |
| **`Media Queries`** | 419 | 410 | **97.9%** | -0.7% |
| **OVERALL** | **23,157** | **21,691** | **93.7%** | 🟢 **+0.6%** |
<!-- WPT_PROGRESS_SUMMARY_END -->

> See [wpt-progress.md](./wpt-progress.md) for the live historical progress log and [scripts/wpt/node/README.md](./scripts/wpt/node/README.md) for feasibility architecture and capability boundaries.

## Development

Run type checking:
```bash
pnpm run typecheck
```

Run tests:
```bash
pnpm test
```

## Project Documents

- `ARCHITECTURE.md`: High-level codebase architecture, module ownership, and orientation map.
- `PLAN.md`: High-level project plan and roadmap (older completed phases in `PLAN.archive.md`).
- `AGENTS.md`: Instructions and context for AI agents working on this repo.
- `LOOP.md`: Details the multi-agent PR lifecycle loops.

## Related Proposals

- [CSS Parser Extensions](https://github.com/bramus/css-parser-extensions): A proposal along similar lines to the CSS Parser API by Bramus.
