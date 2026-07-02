# Spec Compliance Audit Report (Round 10)

This report consolidates findings from the 8 active spec auditors that reviewed the `cssomnom` parser implementation after completing Phase 54.

## 1. CSSOM Level 1

### Findings
- **`StyleSheet.parentStyleSheet` Type Mismatch**: Typed as `StyleSheet | null` instead of `CSSStyleSheet | null`.
- **Missing `[PutForwards=cssText]` Setters**: Absent for `CSSPageRule`, `CSSMarginRule`, `CSSFontFaceRule`, and `CSSKeyframeRule`.
- **Misplaced `cssFloat` Attribute**: Defined directly on `CSSStyleDeclaration` instead of `CSSStyleProperties`.
- **`CSSRule` Constants (Cross-Spec Mixing)**: Includes `KEYFRAMES_RULE` and `KEYFRAME_RULE` which are not in CSSOM-1. Misses `SUPPORTS_RULE = 12`.

## 2. CSS Nesting Module Level 1

### Findings
- **`@scope` Rules are Completely Skipped in Cascade**: Instantiated as base `CSSAtRule` instead of `CSSScopeRule`.
- **`CSSNestedDeclarations` are Skipped Without a Parent**: Ignored if `parentSelector` evaluates to falsy.
- **Specificity of Unparented `&` is Incorrect**: Resolves to `:scope` with specificity `[0,1,0]` instead of zero specificity.
- **Nested `@scope` Prelude Not Absolutized**: Does not insert or absolutize implied nesting selector in `<scope-start>`.

## 3. CSS Variables & Properties API

### Findings
- **`@property` Rules Have Global Side-Effects During Parsing**: Synchronously calls `register()` during parsing and discards duplicates.
- **`var()` Fallback Skipped on Cycles**: Early return on cycle detection skips fallback evaluation.
- **Trailing Invalid Arguments in `var()` Ignored**: `var(--foo bar)` is successfully parsed.
- **Naïve Data Type Validation**: Shallow token checks for `<color>`, `<length>`, and `<transform-list>`.

## 4. CSS Values Level 4 & Typed OM

### Findings
- **`CSSTranslate`, `CSSScale`, and `CSSRotate` Typings**: Properties like `z` are optional in TypeScript interfaces.
- **`CSSMatrixComponent` DOMMatrix Immutability**: Types `matrix` as `DOMMatrixReadOnly` instead of `DOMMatrix`. Misses `options` argument.
- **`CSSColorValue` Lacks Primitive Ergonomics**: Constructors strictly typed to only accept `CSSNumericValue | CSSKeywordValue`.
- **Invalid Parsing of `+infinity`**: Code explicitly accepts `+infinity` and implements manual lookahead for `+`/`-` before `infinity`.
- **`clamp()` is Missing the `none` Keyword**: Parser strictly requires valid math expression and rejects `none`.
- **Missing Type Checking in `CSSMathClamp` and `CSSMathRound`**: Fails to check type consistency across all arguments.

## 5. Selectors Level 4

### Findings
- **Over-restriction After Element-Backed Pseudo-Elements**: Restricts pseudo-classes/elements after `::part()`, `::slotted()`, and misses `::details-content`.
- **Incorrect `SyntaxError` for Unknown `:dir()` Arguments**: Throws if not `ltr` or `rtl`.
- **Technical Debt: Fails to Validate Functional Pseudo-class Usage**: Any known pseudo-class can be parsed as a function without throwing.

## 6. CSS Syntax Level 3

### Findings
- **`!important` Extraction Order Bug**: Checks for curly block before removing `!important`.
- **At-Rules Dropped on EOF/Close Brace**: Discards rule entirely on `EOF` or `}`.
- **Precision Loss in Numeric Tokens**: Converts float value back to string via `.toString()`.
- **Technical Debt on Block Contents**: Suggests avoiding aggressively flattening declarations.

## 7. Media Queries Level 4

### Findings
- **Unknown Features Replaced with `not all` at Parse Time**: Fails to preserve structurally valid queries with unknown features in AST.
- **Over-engineering: Truth-value evaluation at parse time**: Unnecessary evaluation logic and type-checking at parse time.
- **`min-` and `max-` prefixes in a boolean context incorrectly treated as top-level parse errors**: Fails to fall back to `<general-enclosed>`.
- **Invalid compound operators (`< =`) incorrectly treated as top-level parse errors**: Bypasses `<general-enclosed>` fallback.
- **Range context values are not validated against feature value types**: `parseRangeContext` doesn't validate value type.
- **Technical Debt: "False in the negative range" is not statically evaluated**: Returns `TruthValue.MAYBE` for `(width: -100px)`.
