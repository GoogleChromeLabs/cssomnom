# cssomnom

[![npm version](https://img.shields.io/npm/v/cssomnom.svg)](https://www.npmjs.com/package/cssomnom)

A high-performance, zero-dependency, spec-compliant CSS Object Model (CSSOM) parser and query engine in pure TypeScript. Purpose-built for static analysis, testing, and eating style rules for breakfast.

_If you couldn't tell, this project was enabled due to coding agents. Coding agents + conformance suites is a really fun meta-project (I recommend it!).  This library is still young and while I am using it in prod, I wouldn't enthusiastically recommend it for all. :)_

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

### Dual-Path Imports & Node 24+ Erasable TS

`cssomnom` provides two import paths. You can use the standard pre-bundled ESM package, or import the raw TypeScript source directly (perfect for Node 24.11.0+ with erasable syntax or modern bundlers).

```typescript
// Standard bundle import
import { parse } from 'cssomnom';

// Pure TypeScript import (Node 24+ or bundlers)
import { parse } from 'cssomnom/ts';
```

### Basic CSS Parsing & Rule Traversal

Parse CSS into a standard `CSSStyleSheet` and traverse rules like `CSSStyleRule`, `CSSMediaRule`, and `CSSNestedDeclarations`.

```typescript
import { parse } from 'cssomnom';
import type { CSSStyleRule, CSSMediaRule } from 'cssomnom/ts';

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

// Note: Trig functions and other complex math are preserved in the AST structure
// rather than being eagerly simplified to a single value, 
// matching newer CSS Values 4 behavior.
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
const style = getCascadedStyle(element, Array.from(stylesheet.cssRules));

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

*   **`parse(css: string): CSSStyleSheet`** — Parses a CSS string directly into a `CSSStyleSheet`.
*   **`tokenize(css: string): Token[]`** — Synchronous low-level tokenizer.
*   **`serialize(nodes: ComponentValue[] | Token[]): string`** — Serializes AST nodes or tokens back to CSS text.
*   **`new StreamingTokenizer()`** — Class for processing chunked CSS streams.
*   **`getCascadedStyle(element: MatchableElement, rules: Rule[]): CSSStyleDeclaration`** — Computes cascaded styles against a mock/linkedom element.
*   **`Parser` static methods**:
    *   `Parser.parseRuleText(css: string): Rule` — Parses a single CSS rule string.
    *   `Parser.parseStyleSheetText(css: string): Rule[]` — Parses a stylesheet string into an array of rules.
    *   `Parser.parseSelector(css: string): string | null` — Parses and validates a selector string.
    *   `Parser.parseSelectorAST(css: string): SelectorList | null` — Parses a selector string into an AST.
    *   `Parser.calculateSpecificity(selector: string | SelectorList)` — Calculates specificity tuple `[a, b, c]`.
    *   `Parser.resolveVariables(style: CSSStyleDeclaration, property: string)` — Resolves `var()` and `env()` functions.

## Architecture & Spec Boundaries

This section outlines the boundaries between standard CSSOM specifications and custom extensions in this library.

### 1. Standard CSSOM Layer
These APIs are defined in the [CSSOM-1](https://drafts.csswg.org/cssom-1/) specification and related module extensions (CSS Conditional Rules, CSS Nesting, CSS Fonts, CSS Animations, CSS Paged Media, CSS View Transitions, and CSS Cascade). They are designed to mirror standard browser CSSOM APIs in Node.js and headless environments.

**Interfaces & Classes**
- **Base Hierarchy & Collections**: `StyleSheet`, `CSSStyleSheet`, `StyleSheetList`, `CSSRule`, `CSSRuleList`, `CSSGroupingRule`, `MediaList`, `LinkStyle` (TypeScript interface)
- **Style Rules & Nesting**: `CSSStyleRule`, `CSSNestedDeclarations`
- **Conditional & Grouping Rules**: `CSSMediaRule`, `CSSSupportsRule`, `CSSContainerRule`, `CSSLayerBlockRule`, `CSSLayerStatementRule`, `CSSScopeRule`, `CSSStartingStyleRule`
- **Specialized Rules**: `CSSFontFaceRule`, `CSSPageRule`, `CSSMarginRule`, `CSSKeyframesRule`, `CSSKeyframeRule`, `CSSNamespaceRule`, `CSSImportRule`, `CSSPropertyRule`, `CSSCounterStyleRule`, `CSSFontFeatureValuesRule`, `CSSViewTransitionRule`, `CSSAtRule`
- **Declarations & Descriptors**: `CSSStyleDeclaration`, `CSSStyleProperties`, `CSSFontFaceDescriptors`, `CSSPageDescriptors`, `CSSMarginDescriptors`, `CSSFontFeatureValuesMap`

**Deviations & Extensions**
- **Rule Constructors**: Standard CSSOM rules are typically instantiated via `insertRule()` or stylesheet parsing. We allow direct instantiation of rule classes with explicit AST and token parameters (e.g., `new CSSStyleRule(selector, decls, rules)`) for headless manipulation. `CSSStyleSheet` supports standard `CSSStyleSheetInit` options (`new CSSStyleSheet({ baseURL, media, disabled })`).
- **AST Accessors**: `CSSStyleRule.prototype.selectorAST` and `MediaList.prototype.mediaQueriesAST` expose parsed AST structures directly on CSSOM objects for tooling integration.
- **Synchronous `CSSStyleSheet.prototype.replace()`**: While the CSSOM-1 specification specifies parallel parsing for `replace()`, our implementation executes parsing synchronously via `replaceSync()` and returns `Promise.resolve(this)`.
- **`CSSImportRule.styleSheet`**: Evaluates to `null` because the library operates as a static, offline parser without network or disk I/O to load external stylesheets.
- **Legacy `CSSRule.type` Constants**: Numeric type constants (`STYLE_RULE = 1`, `MEDIA_RULE = 4`, etc.) are retained on `CSSRule` instances and static constructors for backward compatibility, with modern rule types evaluating to `0`.

---

### 2. Houdini Layer (Modern & Experimental)
These APIs expose low-level parsing, property registration, and typed values defined in Houdini and CSS Values specifications.

**Specifications Followed**
- **CSS Typed OM Level 1**: `submodules/css-houdini-drafts/css-typed-om/Overview.bs`
- **CSS Typed OM Level 2 / CSS Color API**: `submodules/css-houdini-drafts/css-typed-om-2/Overview.bs`
- **CSS Properties and Values API Level 1**: `submodules/css-houdini-drafts/css-properties-values-api/Overview.bs`
- **CSS Parser API**: Based on the [WICG CSS Parser API](https://github.com/WICG/css-parser-api) draft.
- **CSS Values and Units Level 4**: `submodules/csswg-drafts/css-values-4/Overview.bs` (Calculation trees, math functions, color models).

**Interfaces & Methods**
- **Parser API Methods (`CSS.*` and standalone)**:
    - `CSS.parseStylesheet()`, `CSS.parseStylesheetSync()`
    - `CSS.parseRuleList()`, `CSS.parseRuleListSync()`
    - `CSS.parseRule()`, `CSS.parseRuleSync()`
    - `CSS.parseDeclarationList()`, `CSS.parseDeclarationListSync()`
    - `CSS.parseDeclaration()`, `CSS.parseDeclarationSync()`
    - `CSS.parseValue()` (alias for `parseValueSync`)
    - `CSS.parseValueList()` (alias for `parseValueListSync`)
    - `CSS.parseCommaValueList()` (alias for `parseCommaValueListSync`)
    - `CSS.parseComponentValue()`, `CSS.parseComponentValueSync()`
- **Parser API AST Nodes**:
    - `CSSParserValue`, `CSSParserToken`, `CSSParserBlock`, `CSSParserFunction`
    - `CSSParserRule`, `CSSParserAtRule`, `CSSParserQualifiedRule`, `CSSParserDeclaration`
- **Typed OM Values & Math**:
    - `CSSStyleValue` (base class, `CSSStyleValue.parse()`, `CSSStyleValue.parseAll()`)
    - `CSSKeywordValue`, `CSSUnparsedValue`, `CSSVariableReferenceValue`, `CSSPositionValue`, `CSSImageValue`, `CSSNumericArray`, `createCSSStyleValue`
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
- **Custom Properties & Feature Detection**:
    - `CSS.registerProperty()` (CSS Properties and Values API)
    - `CSS.supports()` (CSS Conditional Rules Level 3 & 4)
    - `CSS.resolveNestedSelector()` (Tooling extension)

**Deviations & Extensions**
- **String Boxing**: The spec defines `CSSToken` as `typedef (DOMString or CSSStyleValue or CSSParserValue) CSSToken;`. We box raw strings in `CSSParserToken` instead of using raw string primitives.
- **Synchronous Execution & Sync Variants**: `parseRule`, `parseDeclarationList`, `parseDeclaration`, and `parseComponentValue` are executed synchronously. In addition, explicit `*Sync` variants (`parseStylesheetSync`, `parseRuleListSync`) are provided for asynchronous methods.
- **Immutability**: AST properties (`prelude`, `body`, `args`) are mutable TypeScript arrays rather than `FrozenArray`.
- **Constructor Arguments**: `body` is mandatory in `CSSParserQualifiedRule` constructor (`constructor(prelude, body)`).
- **CSS Values 4 Math Functions (`CSSMathFunction`)**: New math functions (`sin()`, `cos()`, `abs()`, etc.) are represented by `CSSMathFunction`. Its `operator` getter returns the function's identifier name (e.g. `'sin'`).
- **WebIDL Dictionary Bindings**: Dictionary constraints and computationally independent initial value validations for `CSS.registerProperty()` are enforced natively in JavaScript.
- **`CSSTransformComponent` Inheritance**: `CSSTransformComponent` inherits from `CSSStyleValue`, aligning with browser implementations (Blink, WebKit) and enabling reification from `CSSStyleValue.parseAll()` and `StylePropertyMap.get()`.
- **Math Simplification & AST Structure Preservation**: Calculation trees from `CSSNumericValue.parse()` and `StylePropertyMap` preserve AST structure per CSS Values 4 rather than performing eager unit reduction at parse time.

---

### 3. Custom Bridge & Utility Layer
These APIs are custom utilities for static analysis, cascading, variable resolution, and headless manipulation.

**Interfaces & Methods**
- **`Parser` Static Utilities**:
    - `Parser.parseRuleText(css)`: Parses a single CSS rule string into a `Rule` AST.
    - `Parser.parseStyleSheetText(css)`: Parses a stylesheet string into `Rule[]`.
    - `Parser.parseRuleInBlockText(css, nested?)`: Parses a rule within a nested/block context.
    - `Parser.parseSelector(css)`: Validates and serializes a selector string.
    - `Parser.parseSelectorAST(css)`: Parses a selector string into a `SelectorList` AST.
    - `Parser.calculateSpecificity(selector)`: Calculates selector specificity `[a, b, c]`.
    - `Parser.getCascadedStyle(element, rules)`: Computes cascaded styles against a DOM element.
    - `Parser.resolveVariables(style, property, envMap?)`: Resolves `var()` and `env()` substitutions with fallback handling.
    - `Parser.validateCustomPropertyValue(values)`: Validates component values for custom property declarations.
    - `Parser.isValidDashedIdent(name)`: Validates custom property `--*` identifiers.
    - `Parser.isCustomPropertyDeclaration(decl)`: Checks whether a declaration represents a custom property.
- **Standalone Top-Level Utilities**:
    - `parse(css)`: Direct parser returning a constructable `CSSStyleSheet`.
    - `tokenize(text)`: Low-level tokenizer returning `Token[]`.
    - `serialize(ast)`: Low-level serializer turning AST nodes into CSS text.
    - `getCascadedStyle(element, rules)`: Standalone cascading function.
    - `matches(element, selector)`: Pure-AST static selector matcher.
    - `querySelectorAll(root, selector)` / `querySelector(root, selector)`: AST-based DOM query utilities.
    - `escape(ident)`: Top-level string identifier escaping utility (CSSOM § 3).
    - `StreamingTokenizer`: Memory-efficient streaming generator tokenizer.
    - Standalone Parser API exports for tree-shaking (`parseStylesheet`, `parseStylesheetSync`, `parseRule`, `parseRuleSync`, `parseDeclaration`, `parseDeclarationSync`, `supports`, etc.).

**API Surface Verification**
The public API surface area is locked down and verified by [api-surface.test.ts](./tests/api-surface.test.ts). Any additions or removals of public exports must be reflected in that test to ensure intentional API changes.

---

### Intentional Non-Goals & Boundaries

- **No `getComputedStyle()` Support**: We intentionally **do not** implement or expose `window.getComputedStyle()`. Resolving true computed styles requires a full visual rendering and layout engine (calculating font metrics, line heights, box-model geometry, viewport dimensions, and interaction states like `:hover` / `:focus`). In a server-side, headless Node.js environment, a partially correct `getComputedStyle()` produces subtle, misleading bugs and false confidence (**"if it cannot be completely correct, partially correct is harmful"**). Instead, `cssomnom` provides [`getCascadedStyle(element, rules)`](#static-analysis--cascade-resolution) to resolve deterministic, declarative cascade and specificity order, leaving visual layout to real browsers.

---

**Guidelines for Maintainers**
- When adding new features, clearly identify which layer they belong to.
- Prefer implementing standard APIs (Houdini or CSSOM) over custom ones whenever possible.
- Cite spec anchors in code comments for all standard implementations.

## Web Platform Test (WPT) Conformance

We actively track conformance across 7 major W3C Web Platform Tests (WPT) spec suites (including CSSOM, Syntax, Nesting, Variables, Selectors, Media Queries, and Typed OM).

- **Multi-Spec Sandbox Conformance**: **18,778 passing assertions** (**87.0%** across 21,580 tests). See [wpt-progress.md](https://github.com/GoogleChromeLabs/cssomnom/blob/main/wpt-progress.md) for live pass rates across all 7 spec suites and historical progress logs.

| Spec Domain | **cssomnom** | Chrome 153 (`wpt.fyi`) |
| :--- | :---: | :---: |
| **`Typed OM`** | **11,547 / 12,219 (94.5%)** | 12,341 / 13,125 (94.0%) |
| **`CSSOM`** | **1,607 / 2,161 (74.4%)** | 6,381 / 6,661 (95.8%) |
| **`Selectors`** | **4,279 / 5,691 (75.2%)** | 5,498 / 6,394 (86.0%) |
| **`Syntax`** | **406 / 414 (98.1%)** | 430 / 437 (98.4%) |
| **`Nesting`** | **117 / 117 (100.0%)** | 139 / 140 (99.3%) |
| **`Media Queries`** | **412 / 417 (98.8%)** | 1,799 / 1,825 (98.6%) |
| **`Variables`** | **410 / 561 (73.1%)** | 699 / 772 (90.5%) |
| **OVERALL** | **18,778 / 21,580 (87.0%)** | **27,287 / 29,354 (93.0%)** |

<!-- WPT_CHROME_STATUS_START -->
### Headless Chrome Conformance (Typed OM)
Evaluated directly against the official browser WPT harness (`wpt run chrome css/css-typed-om`):
- **Pass Rate**: 93.58% (11,929 / 12,748 passed)
- **Failed Assertions**: 819
<!-- WPT_CHROME_STATUS_END -->

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

- `PLAN.md`: High-level project plan and roadmap.
- `AGENTS.md`: Instructions and context for AI agents working on this repo.
- `LOOP.md`: Details the multi-agent PR lifecycle loops.
