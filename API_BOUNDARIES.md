# API Boundaries

This document outlines the boundaries between standard CSSOM specifications and custom extensions in this library.

## 1. Standard CSSOM Layer (Legacy)
These APIs are defined in the [CSSOM-1](https://drafts.csswg.org/cssom-1/) specification. They are designed to mimic the standard browser APIs.

### Interfaces
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

### Deviations/Extensions
- **Constructors**: Standard CSSOM usually instantiates these via the DOM. We allow direct instantiation with parameters (e.g., `new CSSStyleSheet(rules)`) to make them usable in Node.js without a full browser environment.
- **Parsing**: Standard CSSOM does not expose static parsing methods on these classes. We use the `Parser` class (see below) to bridge this gap.

---

## 2. Houdini Layer (Modern & Experimental)
These APIs are defined in newer Houdini drafts and are intended to expose lower-level parsing and typed values.

### Specifications Followed
- **CSS Typed OM**: `submodules/csswg-drafts/css-typed-om-1/Overview.bs`
- **CSS Parser API**: Based on the [WICG CSS Parser API](https://github.com/WICG/css-parser-api) draft.

### Interfaces & Methods
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

### Deviations/Extensions
- **String Boxing**: The spec defines `CSSToken` as `typedef (DOMString or CSSStyleValue or CSSParserValue) CSSToken;`. We box strings in `CSSParserToken` instead of allowing raw strings directly.
- **Synchronous Execution**: `parseRule` and `parseDeclarationList` are implemented synchronously instead of returning Promises.
- **Immutability**: Properties like `prelude`, `body`, and `args` are mutable arrays instead of `FrozenArray`.
- **Constructor Arguments**: The `body` parameter is mandatory in some constructors (e.g., `CSSParserQualifiedRule`) where the spec makes it optional.
- **Math Functions**: We support new math functions from CSS Values 4 (like `sin()`, `cos()`, `abs()`, etc.) via a custom `CSSMathFunction` class. Since the CSS Typed OM 1 spec only defines operators for `sum`, `product`, `negate`, `invert`, `min`, `max`, and `clamp`, `CSSMathFunction.operator` returns `'sum'` as a fallback for these new functions to satisfy the type system, which is a known spec gap.

---

## 3. Custom Bridge & Utility Layer
These APIs are NOT part of any W3C specification. They exist to make the library usable for static analysis, testing, and in non-browser environments.

### Interfaces & Methods
- **`Parser` class static utilities**:
    - `calculateSpecificity(selector)`: Calculates the specificity of a selector.
    - `getCascadedStyle(element, rules)`: Calculates computed styles against a static DOM (like `linkedom`).
    - `resolveVariables(style, property, envMap?)`: Expands `var()` and `env()` functions with fallbacks.
- **Standalone Utilities**:
    - `tokenize(text)`: Exposes the low-level tokenizer.
    - `serialize(ast)`: Exposes the low-level serializer.
    - `StreamingTokenizer`: For memory-efficient streaming tokenization.

## API Surface Verification
The public API surface area is locked down and verified by [api-surface.test.ts](./tests/api-surface.test.ts). Any additions or removals of public exports must be reflected in that test to ensure intentional API changes.

---

## Guidelines for Maintainers
- When adding new features, clearly identify which layer they belong to.
- Prefer implementing standard APIs (Houdini or CSSOM) over custom ones whenever possible.
- Cite spec anchors in code comments for all standard implementations.
