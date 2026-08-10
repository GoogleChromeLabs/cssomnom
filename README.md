# cssomnom

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

## Architecture & Spec Boundaries

This document outlines the boundaries between standard CSSOM specifications and custom extensions in this library.

### 1. Standard CSSOM Layer (Legacy)
These APIs are defined in the [CSSOM-1](https://drafts.csswg.org/cssom-1/) specification. They are designed to mimic the standard browser APIs.

**Interfaces**
- `CSSStyleSheet`
- `CSSStyleRule`
- `CSSMediaRule`
- `CSSSupportsRule`
- `CSSFontFaceRule`
- `CSSPageRule`
- `CSSKeyframesRule`
- `CSSKeyframeRule`
- `CSSNamespaceRule`
- `CSSImportRule`
- `CSSStyleDeclaration`
- `MediaList`
- `StyleSheetList`
- `LinkStyle`

**Deviations/Extensions**
- **Constructors**: Standard CSSOM usually instantiates these via the DOM. We allow direct instantiation with parameters (e.g., `new CSSStyleSheet(rules)`) to make them usable in Node.js without a full browser environment.
- **Parsing**: Standard CSSOM does not expose static parsing methods on these classes. We use the `Parser` class (see below) to bridge this gap.
- **`CSSImportRule.styleSheet`**: Hardcoded to `null` because the library is a static, offline parser and does not perform network fetches or local I/O to load external imported stylesheets.

---

### 2. Houdini Layer (Modern & Experimental)
These APIs are defined in newer Houdini drafts and are intended to expose lower-level parsing and typed values.

**Specifications Followed**
- **CSS Typed OM**: `submodules/css-houdini-drafts/css-typed-om/Overview.bs`
- **CSS Parser API**: Based on the [WICG CSS Parser API](https://github.com/WICG/css-parser-api) draft.

**Interfaces & Methods**
- `CSS.parseStylesheet()`
- `CSS.parseRuleList()`
- `CSS.parseRule()`
- `CSS.parseDeclarationList()`
- `CSS.parseDeclaration()`
- `CSS.parseValue()`
- `CSS.parseValueList()`
- `CSS.parseCommaValueList()`
- `CSSParserRule`, `CSSParserAtRule`, `CSSParserQualifiedRule`
- `CSSParserDeclaration`, `CSSParserBlock`, `CSSParserFunction`
- `CSSNumericValue`, `CSSUnitValue`, `CSSMathValue` (and subclasses)
- `CSSTransformValue`, `CSSTransformComponent` (and subclasses)
- `StylePropertyMap` (Read-Write and Read-Only)

**Deviations/Extensions**
- **String Boxing**: The spec defines `CSSToken` as `typedef (DOMString or CSSStyleValue or CSSParserValue) CSSToken;`. We box strings in `CSSParserToken` instead of allowing raw strings directly.
- **Synchronous Execution**: `parseRule` and `parseDeclarationList` are implemented synchronously instead of returning Promises.
- **Immutability**: Properties like `prelude`, `body`, and `args` are mutable arrays instead of `FrozenArray`.
- **Constructor Arguments**: The `body` parameter is mandatory in some constructors (e.g., `CSSParserQualifiedRule`) where the spec makes it optional.
- **Math Functions**: We support new math functions from CSS Values 4 (like `sin()`, `cos()`, `abs()`, etc.) via a custom `CSSMathFunction` class. Since the CSS Typed OM 1 spec only defines operators for `sum`, `product`, `negate`, `invert`, `min`, `max`, and `clamp`, `CSSMathFunction.operator` returns `'sum'` as a fallback for these new functions to satisfy the type system, which is a known spec gap.
- **WebIDL Dictionary Bindings**: In a browser, the WebIDL bindings layer automatically checks dictionary constraints (like checking that the `name` parameter in `CSS.registerProperty()` options is present and throwing a `TypeError`). In our headless Node runtime, we perform these validations manually in JavaScript.
- **`CSSTransformComponent` Inheritance**: In the CSS Typed OM Level 1 specification, `CSSTransformComponent` does not inherit from `CSSStyleValue`. However, to support properties like `translate` and `rotate` which reify directly to transform components, and to allow them to be returned from `CSSStyleValue.parseAll()` and `StylePropertyMap.get()` (which return `CSSStyleValue`), we make `CSSTransformComponent` extend `CSSStyleValue`. This matches the implementation in modern browsers (like Blink/Chrome).
- **Math Simplification & AST Structure Preservation**: In accordance with CSS Values 4 (Calculation Trees), we preserve the raw parsed AST structure of mathematical expressions in `CSSNumericValue.parse()` and `StylePropertyMap` parsing rather than performing eager simplification of compatible units (which is expected by older/Level 1 WPT tests). Eager simplification is deferred to computed-value time or manual `.simplify()` calls.

---

### 3. Custom Bridge & Utility Layer
These APIs are NOT part of any W3C specification. They exist to make the library usable for static analysis, testing, and in non-browser environments.

**Interfaces & Methods**
- **`Parser` class static utilities**:
    - `calculateSpecificity(selector)`: Calculates the specificity of a selector.
    - `getCascadedStyle(element, rules)`: Calculates computed styles against a static DOM (like `linkedom`).
    - `resolveVariables(style, property, envMap?)`: Expands `var()` and `env()` functions with fallbacks.
- **Standalone Utilities**:
    - `tokenize(text)`: Exposes the low-level tokenizer.
    - `serialize(ast)`: Exposes the low-level serializer.
    - `StreamingTokenizer`: For memory-efficient streaming tokenization.

**API Surface Verification**
The public API surface area is locked down and verified by [api-surface.test.ts](./tests/api-surface.test.ts). Any additions or removals of public exports must be reflected in that test to ensure intentional API changes.

---

**Guidelines for Maintainers**
- When adding new features, clearly identify which layer they belong to.
- Prefer implementing standard APIs (Houdini or CSSOM) over custom ones whenever possible.
- Cite spec anchors in code comments for all standard implementations.

## Web Platform Test (WPT) Conformance

<!-- WPT_CHROME_STATUS_START -->
### Headless Chrome Conformance
- **Pass Rate**: 93.58% (11929 / 12748 passed)
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
