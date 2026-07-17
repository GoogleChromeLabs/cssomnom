# Project Plan: cssomnom, the Modern CSSOM Parser

Objective: Create a modern, spec-compliant, pure JavaScript CSSOM parser, leveraging AI assistance guided by strong conformance suites.

## Phase 1: Foundation & Strategy
- [x] Research and extract relevant CSSOM tests from W3C Web Platform Tests (WPT). (Checked out WPT as submodule at tests/web-platform-tests)
- [x] Convert tests to portable fixtures (JSON/YAML) if necessary for pure JS testing. (Extracted 1200+ authentic test cases from WPT into tests/fixtures/wpt-extracted.json and tests/fixtures/typed-om.json)
- [x] **Decide on Target API Layer**: Both CSSOM and CSS Typed OM (as an add-on).
- [x] **Define exact scope of spec support**:
    - **Tier 1: Core Parser & CSSOM**
        - `cssom/`
        - `css-syntax/`
        - `css-values/`
        - `selectors/`
        - `css-conditional/`
        - `css-variables/`
        - `css-nesting/`
        - `css-namespaces/`
    - **Tier 2: API Extensions**
        - `css-typed-om/`
        - `css-style-attr/`
    - **Out of Scope (for now)**
        - `cssom-view/`
        - `css-properties-values-api/`
        - `css-parser-api/`

## Phase 2: Architecture & Design
- [x] **Design Tokenizer (Lexer)**:
    - [x] Define CSS token types according to CSS Syntax Module Level 3. (Done in `src/types.ts`)
    - [x] Decide on streaming tokens vs. buffering. (Decided on buffering; streaming as follow-up).
- [x] **Design AST (Abstract Syntax Tree)**:
    - [x] Create TypeScript interfaces in `src/types.ts` for `CSSStyleSheet`, `CSSRule`, and `CSSStyleDeclaration`.
- [x] **Design Parser Architecture**:
    - [x] Write a skeleton parser that handles top-level structure (rules, blocks) using a non-backtracking predictive parser.

## Phase 3: AI-Assisted Implementation
*Strategy: We will use autonomous AI agents for this phase. `PLAN.md` remains our strategic source of truth. When ready, we will generate a dedicated `.gemini/tasks.md` file containing atomic checkboxes for the agent to execute unattended.*


- [x] **Setup automated test loop**:
    - *Action*: Create a runner that reads the extracted JSON fixtures and asserts against the parser's output.
- [x] **Generate `.gemini/tasks.md` for AI agent**:
    - [x] Decompose the parsed-out components (Tokenizer, Core Parser, etc.) into atomic tasks for the AI agent.
- [x] **Implement Tokenizer**:
    - [x] Build the tokenizer in `src/tokenizer.ts` and verify against spec examples.
- [x] **Implement Parser - Core**:
    - [x] Support parsing declaration values (component values, simple blocks, functions).
    - [x] Complete support for style rules and property-value pairs in full stylesheets.
- [x] **Implement Parser - Advanced**:
    - [x] Support `@media`, `@keyframes`, and CSS variables.

## Phase 4: Hardening & Optimization
- [x] **Implement Fuzzer**:
    - [x] Build a fuzzer to ensure the parser handles invalid CSS without throwing exceptions.
- [x] **Benchmark Integration**:
    - [x] Create benchmark scripts to compare against PostCSS and read-only file sizes.

## Phase 5: API Extensions & Bulk Verification
- [x] **Implement Tier 2 API Extensions**:
    - [x] Support `css-style-attr/` (style attributes) and implemented basics of `css-typed-om/`.
- [x] **Bulk Verification**:
    - [x] Create a script to find and parse all `.css` files in the WPT submodule to ensure zero crashes on real-world data.

## Phase 6: Modern CSS Support - CSS Nesting

Objective: Implement support for CSS Nesting Module Level 1, allowing style rules and at-rules to be nested within other style rules.

**Spec References**:
- CSS Nesting Module Level 1: [css-nesting-1/Overview.bs](submodules/csswg-drafts/css-nesting-1/Overview.bs)
- CSS Syntax Module Level 3: [css-syntax-3/Overview.bs](submodules/csswg-drafts/css-syntax-3/Overview.bs) (Referenced for general parsing rules)

### Tasks

#### 1. Parser Refactoring (`src/parser.ts`)
- [x] **Refactor `consumeListOfDeclarations`**:
    - Modify it to accept both declarations and rules.
    - *Strategy*: When parsing a style rule's block, iterate through component values. If a value looks like the start of a rule (e.g., an at-keyword or a sequence that doesn't match property-colon-value), attempt to parse it as a rule or at-rule.
    - Ensure correct handling of semicolons as declaration terminators vs. rule boundaries.
- [x] **Support Implicit Nesting**:
    - Recognize child rules that start with type selectors (identifiers) or combinators, as per the latest spec (which removed the requirement for `&` or `@nest` in many cases).
- [x] **Implement `CSSGroupingRule` support in Parser**:
    - Ensure that `CSSStyleRule` objects created by the parser have a `cssRules` property containing their nested rules, adhering to the `CSSGroupingRule` interface defined in `src/types.ts`.
- [x] **Handle `CSSNestedDeclarations` (Optional/Advanced)**:
    - If properties appear *after* a nested rule, they should be wrapped in a `CSSNestedDeclarations` rule to preserve order and cascade, as per recent spec updates.

#### 2. Verification & Fixtures
- [x] **Create `tests/nesting.test.ts`**:
    - Add targeted tests for nesting cases identified in WPT.
- [x] **Extract Fixtures from WPT**:
    - Use examples from `submodules/web-platform-tests/css/css-nesting/cssom.html` and `parsing.html` to create unit tests.
- [x] **Unskip Case 2 in `tests/tricky-cases.test.ts`**:
    - Verify that the "Native CSS Nesting" test case passes.

#### 3. Documentation
- [x] Update `MODERN_CSS_SUPPORT.md` to reflect that CSS Nesting is now supported.

## Phase 7: Hardening CSSOM API

Objective: Implement missing CSSOM API methods identified as gaps by the compliance audit.

### Tasks
- [x] **Implement `CSSStyleSheet` methods**:
    - `insertRule(rule, index)`
    - `deleteRule(index)`
- [x] **Implement `CSSStyleDeclaration` methods**:
    - `setProperty(property, value, priority)`
    - `removeProperty(property)`
- [x] **Implement `CSSStyleRule` methods**:
    - `insertRule` and `deleteRule` (via `CSSGroupingRule`).
- [x] **Verification**:
    - Add tests to verify these methods against spec expectations.
    - **Extract Fixtures from WPT**: Used `cssom.html` as reference for unit tests in `tests/api.test.ts`.

## Optional Follow-up Work
- [x] **Implement Streaming Tokenizer**:
    - [x] Add support for streaming tokens for memory efficiency with large files.

*Note: Agents should update this file to mark tasks as complete or add sub-tasks as needed.*

## Phase 8: Class-Based Architecture

Objective: Refactor from factory-based object creation to proper ES6 class instances to support `instanceof` and better align with spec expectations.

### Tasks
- [x] **Define classes in `src/CSSOM.ts`**:
    - `CSSStyleSheet`, `CSSStyleRule`, `CSSMediaRule`, `CSSKeyframesRule`, `CSSKeyframeRule`, `CSSNestedDeclarations`, and `CSSStyleDeclaration`.
- [x] **Update `src/parser.ts` to use these classes**:
    - Refactor factory functions to use `new ClassName(...)`.
- [x] **Verification**:
    - Add `instanceof` tests to `tests/api.test.ts`.
    - Verify all tests pass.

## Phase 9: Streaming Tokenizer Integration

Objective: Bridge the `StreamingTokenizer` to the `Parser` to improve memory efficiency for large files.

### Tasks
- [x] **Define `TokenStream` interface** in `src/types.ts`.
- [x] **Implement `ArrayTokenStream` and `StreamingTokenizerStream`** in `src/TokenStream.ts`.
- [x] **Refactor `Parser` to use `TokenStream`** in `src/parser.ts`.
- [x] **Verify** with tests, including a new integration test in `tests/streaming.test.ts`.

## Phase 10: Red Team Refactor (Sanity & Maintainability)

Objective: Address architectural smells and lack of type safety identified by Red Team review.

> [!IMPORTANT]
> **Message to the Junior Engineer assigned to this task:**
> I have seen systems fail because of sloppy, untyped code and duplicated logic. If you mess this up, you will be the one answering the pager at 3 AM on a Saturday to fix it. Do it right the first time. Follow the rules of taste. No shortcuts.

### Tasks

- [x] **Type the AST (Kill the `any`s)**:
    - **Goal**: Eliminate all uses of `any` and `any[]` in `src/parser.ts` and `src/CSSOM.ts`.
    - **Instructions**:
        1. Open `src/types.ts` and define specific interfaces for the AST nodes. Look at what `consumeRule`, `consumeAtRule`, and `consumeComponentValue` return.
        2. Create a `ComponentValue` type (which could be a `Token` or a simple block).
        3. Create `Declaration` and `Rule` interfaces.
        4. **CRITICAL**: Do NOT use TypeScript `enum`s. Use string literal unions or discriminated unions as per the Manifesto.
        5. Refactor `src/parser.ts` to use these types instead of `any`. If you need to cast temporarily with `unknown`, do it, but do not leave `any` in the code.

- [x] **Cleanup `parseStyleAttribute` (DRY Violation)**:
    - **Goal**: Stop duplicating `CSSStyleDeclaration` logic.
    - **Instructions**:
        1. Look at `src/parser.ts:70` (`parseStyleAttribute`). Notice how it builds a fake object with `Object.assign` and `Object.defineProperty`.
        2. Look at `src/CSSOM.ts:5` (`CSSStyleDeclaration` class).
        3. Refactor `parseStyleAttribute` to simply parse the declarations and then return `new CSSStyleDeclaration(declarations)`.
        4. You may need to adjust the `CSSStyleDeclaration` constructor or methods to handle the array of declarations produced by `consumeListOfDeclarations`. Do not break existing functionality.

- [x] **Decouple Parser and CSSOM (Tight Coupling)**:
    - **Goal**: Remove the hard dependency of `CSSStyleSheet` on the `Parser` class.
    - **Instructions**:
        1. In `src/parser.ts`, `parseStyleSheet` passes the `Parser` class constructor to `new CSSStyleSheet(rules, Parser)`.
        2. In `src/CSSOM.ts`, `CSSStyleSheet` uses `this._ParserClass` to call `new this._ParserClass(...)` in `insertRule` and `replaceSync`.
        3. This is a circular dependency smell. Refactor this.
        4. **Suggestion**: Instead of passing the class, pass a function `(text: string) => CSSRule` (or a list of rules) to the `CSSStyleSheet` constructor. The sheet should only care about *how to parse*, not *what class does the parsing*.

## Phase 11: Addressing Remaining Compliance Issues

Objective: Address the remaining minor non-compliances identified by the auditors to further improve spec fidelity.

### Tasks
- [x] **Implement `cssFloat` on `CSSStyleDeclaration`**:
    - Add `cssFloat` getter/setter to `CSSStyleDeclaration` in `src/CSSOM.ts` as an alias for `float` property.
- [x] **Add Constants to `CSSRule` Instances**:
    - Ensure that constants like `STYLE_RULE` are accessible on instances of `CSSRule` and its subclasses, not just statically.
- [x] **Refactor `CSSRuleList` to a Distinct Class**:
    - Create a proper `CSSRuleList` class in `src/CSSOM.ts` that implements the required interface (length, item(), and indexed getters) instead of using `Object.assign` on an array.
- [x] **Refactor Parser to use Try-and-Fallback for Declarations**:
    - In `consumeBlockContents` in `src/parser.ts`, move away from `looksLikeDeclaration` heuristic and implement a try-and-fallback approach to better match spec error recovery.
- [x] **Add Lint Script and Fix Failures**:
    - Add a script to `package.json` called `lint` that runs `oxlint src/ --deny no-explicit-any`.
    - Run the linter and fix all reported failures.

## Phase 12: Test Hardening with Edge Cases

Objective: Add unit tests for tricky edge cases identified by auditors from specs and WPT.

### Tasks
- [x] **Add Tokenizer Edge Case Tests**:
    - [x] Escaped EOFs (EOF after `\`).
    - [x] Comments not acting as whitespace (e.g., `foo/*comment*/()`).
    - [x] Null character replacement (`\0` -> `U+FFFD`).
    - [x] Preserved error tokens (newline in string -> `bad-string`).
- [x] **Add Parser Edge Case Tests**:
    - [x] Custom property vs. rule ambiguity (e.g., `div { --x:hover { } .b { } }`).
    - [x] At-rules inside declaration lists.
    - [x] Autoclosing EOF (abrupt end of stylesheet).
    - [x] Variables and `{}` blocks in declarations (valid in custom props, invalid in standard props).
    - [x] `!important` flag with whitespace and comments.
- [x] **Add CSSOM API Edge Case Tests**:
    - [x] `null` in `setProperty()`.
    - [x] The `all` shorthand behavior.
    - [x] Trailing garbage in `insertRule` (must throw).
    - [x] Serialization of `cssText` final delimiter (must include `;`).
    - [x] Shorthand serialization with logical properties.

## Phase 13: Parser Simplification

Objective: Refactor and simplify `src/parser.ts` based on subagent feedback.

### Tasks
#### Phase 1: Quick Wins & Cleanups
- [x] **Fix Magic Numbers**: Replaced magic numbers with named constants (done by user).
- [x] **Fix remaining closures in loops**: Check for any remaining closures used for iteration and replace with direct index access.
- [x] **Remove obvious comments**: Remove comments that just restate the code (e.g., `// Skip whitespace`). Keep spec references.

#### Phase 2: Refactoring & Deduplication
- [x] **Extract Nested Rules Parsing Helper**: Create a private method `consumeNestedRules(block: SimpleBlock): Rule[]` to eliminate duplication in `consumeAtRule`.
- [x] **Address `ParserInternal` Casting**: Move helper functions at the bottom of the file into the `Parser` class as static methods to avoid casting.

#### Phase 3: Advanced Refactoring (Optional/Later)
- [x] **Map-Based Dispatch for At-Rules**: Implement a registry or map for at-rule handlers.
- [ ] **Avoid Re-tokenization**: Explore parsing directly from `ComponentValue[]` without converting back to tokens. (Deferred: Recommended to wait for performance bottleneck).
- [x] **Follow-up: Added targeted unit tests** in `tests/parser-refactor.test.ts` to increase coverage for refactored components.

## Phase 14: Tokenizer Unification & Optimization

Objective: Resolve massive code duplication between `src/tokenizer.ts` and `src/streaming-tokenizer.ts` and fix critical streaming issues.

### Tasks
#### Step 1: Fix Critical Streaming Issues
- [x] **Fix memory leak in `StreamingTokenizer`**: Truncate `codePoints` after tokens are emitted.
- [x] **Verify/Fix syntax error**: Checked `consumeRemnantsOfBadUrl` and confirmed it's correct.

#### Step 2: Unify Implementations
- [x] **Extract Abstract Base Class**: Created `AbstractTokenizer` containing all spec algorithms.
- [x] **Refactor `Tokenizer` and `StreamingTokenizer`**: Made them extend `AbstractTokenizer` and removed duplicated code.

#### Step 3: Optimize and Polish
- [x] **Convert `if-else` to `switch`**: Optimized `consumeToken` hot path in `AbstractTokenizer`.
- [x] **Remove non-null assertions and type coercions**: Replaced with type guards in both tokenizers.
- [x] **Fill in empty parse error comments**: Added details to `// Parse error` comments.

## Phase 15: External Test Integration

Objective: Integrate test cases from NV/CSSOM, CSSTree, and PostCSS to improve coverage and compliance.

### Tasks
#### Step 1: Setup Submodules and Scripts
- [x] **Add Git Submodules**: Added NV/CSSOM, CSSTree, and PostCSS as submodules in `submodules/`.
- [x] **Save Extraction Scripts**: Saved extraction scripts in `scripts/`.

#### Step 2: Integrate Tests
- [x] **Integrate CSSTree Error Tests**: Added 26 error tests (12 failing, baseline established).
- [x] **Integrate NV/CSSOM Tests**: Added 43 tests (some failing on serialization differences).
- [x] **Integrate PostCSS and CSSTree AST Tests**: Implemented round-trip tests (most failing due to formatting).

## Phase 16: CSSOM & Typed OM Optimization and Simplification

Objective: Address technical debt, performance issues, and architectural concerns in `src/CSSOM.ts` and `src/typed-om.ts`.

### Tasks
#### Step 1: Low-Hanging Fruit (Safety & Reuse)
- [x] **Fix Type Coercion**: In `src/typed-om.ts` (`StylePropertyMapReadOnly.get`), replace the `as Token` cast with a proper type guard.
- [x] **Extract Shared Helpers**:
  *   Create a helper for creating indexed proxies to reduce boilerplate in `CSSStyleDeclaration`, `MediaList`, and `CSSRuleList`.
  *   Extract a shared `deleteRuleFromArray` helper.

#### Step 2: Performance Optimizations
- [x] **Optimize `cssText` Serialization**:
  *   In `CSSStyleDeclaration.cssText`, use a temporary `Map` to look up declarations by name to reduce complexity from $O(N^2)$ to $O(N)$.
  *   Decompose this large method into smaller step functions.
- [x] **Reduce Allocations**:
  *   Refactor `StylePropertyMapReadOnly.get` to avoid creating new arrays via `.filter()`.
  *   Avoid instantiating `CSSStyleDeclaration` in `CSSStyleRule.cssText` just for stringification.

#### Step 3: Architecture & Hardening
- [x] **Decouple Parser**: Look into removing the injection of parser functions into the CSSOM classes.
- [x] **Improve Types**: Replace the generic `string` type for units in `CSSUnitValue` with a strict string union of valid CSS units.

## Phase 17: Spec Compliance Hardening

Objective: Address non-compliance issues, missing features, and edge cases identified by the spec compliance auditors.

### Tasks

#### Step 1: Critical Compliance Fixes
- [x] **CSSOM**: Implement `CSSStyleRule.selectorText` setter with proper validation and parsing.
- [x] **CSS Nesting**: Refactor `createStyleRule` to properly separate interleaved declarations and expose them via `CSSNestedDeclarations` rules in the CSSOM.
- [x] **Media Queries**: Implement a proper media query parser to replace naive string splitting and handle invalid queries correctly (replace with `not all`).

#### Step 2: Missing Features & Edge Cases
- [x] **CSS Variables**:
  *   [x] Reject invalid top-level tokens in custom properties.
  *   [x] Serialize empty custom properties as a single space.
  *   [x] Preserve comments in custom property values.
- [x] **Typed OM**:
  *   [x] Add missing modern units to `CSSUnit` union type.
  *   [x] Support complex values and math functions in `createCSSStyleValue`.
- [x] **Serialization**: Implement specific serialization rules for math functions.

#### Step 3: Edge Case Tests
- [x] Add tests for tricky edge cases identified by researchers:
  *   Unclosed constructs auto-closing at EOF.
  *   Escaped EOF handling.
  *   Input preprocessing (NULLs, surrogates).
  *   `unicode-range` descriptor re-tokenization.

## Phase 18: Continuous Compliance Hardening

Objective: Address non-compliance issues and technical debt identified by the second round of spec compliance auditors.

### Tasks

#### Step 1: Tokenizer & Parser Compliance
- [x] **Syntax**: Implement the `"id"` flag on Hash tokens (identifies as ID or unrestricted).
- [x] **Syntax**: Implement `<urange>` production for `unicode-range` descriptor in tokenizer/parser (currently test is TODO).
- [x] **CSSOM**: Fix `selectorText` setter to ignore invalid inputs instead of throwing `SyntaxError` (as per spec). Update tests accordingly.
- [x] **Variables**: Fix `serializer.ts` to preserve case for function names in custom property values.

#### Step 2: Math Functions & Typed OM
- [x] **Values**: Implement eager simplification in `math-parser.ts` (simplify calculation tree during construction).
- [x] **Values**: Support commas in `parseMathFunction` to support multi-argument functions like `min()`, `max()`, `clamp()`.
- [x] **Values**: Refine unit sorting in `sortChildren` to be strictly ASCII case-insensitive.

#### Step 3: Media Queries
- [x] **Media Queries**: Implement `<general-enclosed>` in `MediaParser.ts` to support forward compatibility (unknown parenthesized content evaluates to `unknown`).

#### Step 4: Cleanup & Boilerplate
- [x] **Logical Properties**: Refactor `src/CSSOM.ts` to remove duplicate `tryCombineLogicalShorthand` code (exists as both file-level function and class method).
- [x] **CSSOM**: Add missing deprecated constants to `CSSRule` interface and implementation.

## Phase 19: Resolving Skipped Tests & Full Conformance

Objective: Systematically address the backlog of skipped external tests from W3C WPT, CSSTree, and PostCSS to achieve 100% spec compliance.

### Tasks

#### Step 1: Categorize Skipped Tests
- [x] Analyze the currently skipped tests in `tests/` (especially fixtures extracted from submodules).
- [x] Group them by feature or failure type (e.g., "Selector Specificity", "Complex At-Rules", "Error Recovery Edge Cases").

#### Step 2: CSSOM & Interface Hardening
- [x] **CSSRule**: Add empty setter for `cssText` in subclasses to prevent `TypeError` in strict mode when attempting to set it (spec says it should do nothing).
- [x] **CSSGroupingRule**: Add `insertRule` and `deleteRule` to the interface in `src/types.ts`.
- [x] **CSSStyleRule**: Implement `[PutForwards=cssText]` behavior for the `style` attribute (setting `rule.style = "..."` should forward to `rule.style.cssText = "..."`).
- [x] **CSSStyleDeclaration**: Implement `cssText` setter (should parse the value as a declaration list and update declarations).

#### Step 3: Parser & Tokenizer Compliance
- [x] **Syntax**: Harden `consumeAtRule` and `consumeQualifiedRule` to handle `}` in nested contexts and check for custom property syntax in preludes.
- [x] **Nesting**: Validate nested selectors in `normalizeNestedSelector` (e.g., reject invalid constructs like `&div`).
- [x] **Variables**: Validate `var()` references in custom properties and improve unmatched brackets check to be recursive or stream-based.

#### Step 4: Media Queries & Math Functions
- [x] **Media Queries**: Implement a registry of known media features to reject or mark as unknown any features not in the registry.
- [x] **Math Functions**: Implement distribution of numbers over sums in simplification (e.g., `2 * calc(10px + 20px)`).
- [x] **Math Functions**: Handle `Infinity` and `NaN` in parsing and serialization.

## Phase 20: Fine-Grained Compliance & Edge Cases

Objective: Address remaining compliance gaps identified in Round 4 audits to achieve full conformance.

### Tasks

#### Step 1: CSSOM & Interfaces
- [x] **CSSStyleRule**: Refactor `selectorText` setter to use a dedicated `Parser.parseSelector` instead of the rule-parsing hack.
- [ ] **CSSStyleProperties**: (Optional/Future) Implement camel-cased property attributes on `style` object.

#### Step 2: Parser & Syntax
- [x] **Syntax**: Implement `unicode-range` tokenization properly in `AbstractTokenizer` (instead of parser workaround).
- [x] **Syntax**: Add `nested` flag support to `consumeAtRule` to handle `}` correctly in nested contexts.

#### Step 3: Media Queries
- [x] **Media Queries**: Enforce consistent operators in chained comparisons in range context (e.g., reject `100px < width > 200px`).
- [x] **Media Queries**: Revisit `<general-enclosed>` handling to align with spec's "unknown -> not all" rule for unresolved queries. (Decided to preserve original text)

#### Step 4: Values & Typed OM
- [x] **Math Functions**: Strip outer parentheses when serializing arguments for `min()`/`max()`.
- [x] **Math Functions**: Handle Infinity/NaN with units (serialize with canonical unit, e.g., `calc(infinity * 1px)`).
- [x] **Math Functions**: Implement clamping for computed values during serialization.

## Phase 21: Polish & Deep Spec Compliance

Objective: Address remaining minor compliance gaps and edge cases identified in Round 5 audits.

### Tasks

#### Step 1: Tokenizer & Syntax
- [x] **Syntax**: Add `unicode ranges allowed` flag to tokenizer and only parse `unicode-range` when enabled.
- [x] **Nesting**: Improve error recovery in `consumeBlockContents` (skip to next semicolon or matching brace instead of just `i++`).

#### Step 2: Variables & Custom Properties
- [x] **Variables**: Explicitly trim leading whitespace when collecting tokens for custom property values in `consumeDeclarationFromValues`.

#### Step 3: Logical Properties & CSSOM
- [x] **Logical**: Support logical border-radius properties in `logicalShorthands` (e.g., `border-start-start-radius` etc.).
- [ ] **CSSOM**: (Optional) Implement `CSSStyleProperties` via Proxy to support camel-cased property access on `style` object.

#### Step 4: Values & Typed OM
- [x] **Math Functions**: Ensure specified values that simplify to a single numeric value still serialize wrapped in `calc()` (e.g., `calc(50px)`).
- [x] **Math Functions**: Ensure unitless infinity/NaN always starts with `calc(` in serialization (e.g., `calc(infinity)`).

## Phase 22: Spec Citations & CSSStyleProperties

Objective: Fulfill the "Executable Specification" requirement by adding missing spec citations, and implement the optional `CSSStyleProperties` interface.

### Tasks

#### Step 1: Spec Citations
- [x] **Citations**: Add spec citations (format `// X.X.X Title`) to `src/tokenizer.ts`.
- [x] **Citations**: Add spec citations to `src/CSSOM.ts` (especially `insertRule` and `cssText` getters).
- [x] **Citations**: Add spec citations to `src/typed-om.ts`.
- [x] **Citations**: Add spec citations to `src/math-parser.ts`.

#### Step 2: CSSStyleProperties Proxy (Parser Hardener 2)
- [x] **CSSOM**: Implement `CSSStyleProperties` via Proxy to support camel-cased (e.g., `style.fontSize`) and dashed (e.g., `style['font-size']`) property access on the `style` object.

## Phase 23: Performance & Debt Consolidation

Objective: Address technical debt, improve type safety, and implement performance optimizations identified in the audit report.

### Tasks

#### Step 1: Critical Fixes & Hacks
- [x] **Math Functions**: Fix fallback serialization in `math-parser.ts` to avoid `[object Object]` (Not found/applicable).
- [x] **Media Queries**: Remove `require('./tokenizer.ts')` in `MediaParser.ts` and fix `extends (Parser as any)` (Not found/applicable).

#### Step 2: Code Quality & Type Safety
- [x] **Types**: Eliminate `any` in `CSSOM.ts`, `MediaParser.ts`, and `math-parser.ts`.
- [x] **Serialization**: Deduplicate local serialize functions in `CSSOM.ts` and move to `serializer.ts`.

#### Step 3: Performance Optimizations
- [x] **Parser**: Avoid re-tokenization in `parser.ts` for nested rules (operate on component values directly).
- [x] **Tokenizer**: Optimize with slice-based string extraction (handling escapes correctly).
- [x] **CSSOM**: Use `Map` + `Array` for `CSSStyleDeclaration` lookup (preserving order and handling logical properties constraint).





## Phase 24: Resolving Final Compliance Skips

Objective: Address remaining TODO(compliance) skips in the test suite to reach maximum conformance.

### Tasks
- [x] **Drop Unknown At-Rules**: Refactored `consumeAtRule` to drop unsupported at-rules (like `@mediaall` and any starting with `@--`) while preserving standard and vendor-prefixed ones as `CSSUnknownRule`.
- [x] **Support @page rules**: Implemented `CSSPageRule` and added support for declarations directly inside `@page` blocks.
- [x] **Support Nested Declarations in Grouping Rules**: Refactored `consumeNestedRules` and `consumeBlockContents` to wrap raw declarations in grouping rules (e.g. `@media`) into `CSSNestedDeclarations` rules, adhering to the CSS Nesting spec.
- [x] **Fix Serialization Gaps**: Standardized empty block serialization to `{}` and improved `normalizeWhitespace` in tests to handle minor formatting differences (comments, semicolons).
- [x] **Verify Full Suite**: Achieved 100% pass rate across `advanced.test.ts`, `nesting.test.ts`, `external_nv.test.ts`, and `external_roundtrip.test.ts`.

## Phase 25: Validated Spec Compliance Fixes

Objective: Address non-compliance issues and missing features validated by the Scrutineer agent.

### Validated Findings (Source of Truth: Bikeshed files in submodules)

#### CSS Logical Properties
- [x] **Fix intervening property check**: Relax overly restrictive check in `src/serializer.ts` based on mapping logic. (Spec: `cssom-1 #serializing-css-values`)
- [x] **Complete `propertyToGroup` map**: Add missing size and border-radius groups. (Spec: `css-logical-1 #box`)
- *Note: Subagent finding about missing shorthands for Scroll Snap and Overscroll was invalidated by Scrutineer.*

#### CSS Syntax
- [x] **Fix `<unicode-range-token>` consumption**: Tokenizer should only eagerly consume it when allowed (e.g., in `@font-face`). (Spec: `css-syntax-3 #consume-token`)
- [x] **Transition to "Consume a block's contents"**: Replace legacy "List of declarations" algorithm. (Spec: `css-syntax-3 #consume-block-contents`)
- [ ] **Operate on Token Stream**: (Optional but recommended) Refactor parser to operate directly on token stream instead of component values.

#### CSSOM Spec
- [x] **Fix `CSSPageRule` inheritance**: Make it extend `CSSGroupingRule`. (Spec: `cssom-1 #the-csspagerule-interface`)
- [x] **Implement missing interfaces**: `CSSImportRule`, `CSSMarginRule`, and `CSSNamespaceRule`. (Spec: `cssom-1`)
- [x] **Implement descriptor interfaces**: `CSSPageDescriptors` and `CSSMarginDescriptors`.

#### Media Queries
- [x] **Add deprecated `device-*` features**: Required for backward compatibility. (Spec: `mediaqueries-4 #device-width`)
- [x] **Implement Kleene 3-valued logic**: For error recovery of unknown features. (Spec: `mediaqueries-4 #evaluating`)

### Tasks
- [x] **Implement Fixes**: Task a subagent or proceed with implementing these fixes using Red/Green TDD.
- [x] **Verify Compliance**: Verify implementation against tests and spec.

## Phase 26: WPT Fixture Extraction for Houdini

Objective: Extract test cases from WPT for CSS Properties and Values API and Typed OM to enable Red/Green TDD.

### Tasks
- [x] **Extract `@property` tests**: Use `wpt-fixture-extractor` to pull tests from `css/css-properties-values-api/` in WPT (if available, or create them manually if not).
- [x] **Extract Typed OM tests**: Use `wpt-fixture-extractor` to pull tests from `css/css-typed-om/` in WPT.

## Phase 27: CSS Properties and Values API (Houdini)

Objective: Implement support for `@property` rules to improve ergonomics and spec compliance.

### Tasks
- [x] **Implement `CSSPropertyRule` interface**: Define it in `src/types.ts` and implement in `src/CSSOM.ts`.
- [x] **Register `@property` handler**: Add to `atRuleHandlers` in `src/parser.ts`.
- [x] **Parse Descriptors**: Ensure block contents are parsed as declarations/descriptors (`syntax`, `inherits`, `initial-value`).
- [x] **Add Tests**: Verify using extracted WPT fixtures.

## Phase 28: Advanced Typed OM Support (Houdini)

Objective: Align with `css-typed-om` and `css-typed-om-2` drafts.

### Tasks
- [x] **Audit Typed OM**: Compared current implementation in `src/typed-om.ts` with drafts.
- [x] **Implement Missing Features**: Added support for complex math functions (`min`/`max`/`clamp`), `CSSMathSum`, `CSSMathProduct`, `CSSMathInvert`, `CSSMathNegate`, and `CSSTransformValue` subclasses.
- [x] **Implement `CSSVariableReferenceValue`**: Added support for ergonomic inspection of `var()` references with fallbacks.
- [x] **Add Tests**: Verified using 114 WPT fixtures for Typed OM and 200+ extra WPT fixtures for core CSSOM/Syntax/Values.

## Phase 29: Parser API Reference

Objective: Use `css-parser-api` as a reference for future parser architecture improvements.

### Tasks
- [x] **Audit Parser API**: Read the spec and compared it with the current implementation.
- [x] **Implement `CSSParserValue` Interfaces**: Define `CSSParserRule`, `CSSParserAtRule`, `CSSParserQualifiedRule`, `CSSParserDeclaration`, `CSSParserBlock`, and `CSSParserFunction`.
- [x] **Expose `CSS` Parsing Methods**: Implement `CSS.parseValue()`, `CSS.parseValueList()`, `CSS.parseDeclaration()`, etc. (Dual Sync/Async API).
- [x] **Bridge Parser to Parser API**: Created a mapping layer in `src/parser-api.ts` between internal AST and Houdini Parser API objects.
- [x] **Implement Async Support**: Added Promise-wrapped async versions of all parsing methods.

## Phase 30: Post-Audit Spec Compliance Hardening

Objective: Address validated compliance gaps identified in the high-scrutiny audit.

### Tasks
- [x] **CSSOM Fixes**:
    - [x] Implement proper `MediaList` comparison in `appendMedium`/`deleteMedium`. (Spec: `cssom-1 #the-medialist-interface`)
    - [x] Add missing internal flags and security checks to `CSSStyleSheet`. (Spec: `cssom-1 #the-cssstylesheet-interface`)
    - [x] Implement shorthand expansion in `CSSStyleDeclaration.setProperty` and lookup in `getPropertyValue`. (Spec: `cssom-1 #the-cssstyledeclaration-interface`)
    - [x] Implement missing interfaces: `StyleSheetList`, `LinkStyle`. (Spec: `cssom-1/Overview.bs`)
- [x] **Values & Typed OM Fixes**:
    - [x] Add missing methods to `CSSNumericValue` (`add`, `sub`, `mul`, `div`, `min`, `max`, `equals`). (Spec: `css-typed-om/Overview.bs`)
    - [x] Implement read-write `StylePropertyMap` and missing methods. (Spec: `css-typed-om/Overview.bs`)
    - [x] Add modern math functions to `math-parser.ts` (`sin`, `cos`, etc.). (Spec: `css-values-4/Overview.bs`)
- [x] **Logical Properties Fixes**:
    - [x] Add support for `logical` keyword in physical shorthands. (Spec: `css-logical-1 #logical-shorthand-keyword`)
    - [x] Implement `inset` shorthand in combination logic. (Spec: `css-logical-1 #position-properties`)
    - [x] Add support for `recto` and `verso` keywords/selectors. (Spec: `css-logical-1 #page`)
    - [x] Implement computed value mapping between logical and physical properties. (Spec: `css-logical-1 #box`)
- [x] **CSS Syntax Fixes**:
    - [x] Refactor tokenizer to absorb and skip comments internally. (Spec: `css-syntax-3 #consume-token`)
    - [x] Update `Token` interface and `consumeUnicodeRangeToken` to store numeric range values. (Spec: `css-syntax-3 #consume-unicode-range-token`)
    - [x] Fix CDO/CDC handling in nested blocks. (Spec: `css-syntax-3`)
- [x] **Nesting Fixes**:
    - Add support for more nested at-rules (`@container`, `@supports`, etc.). (Spec: `css-nesting-1 #conditionals`)
- [x] **Investigate**:
    - [x] Investigate `removeProperty('all')` behavior regarding custom properties. (Spec: `css-variables-1 #variables-in-shorthands`)

## Phase 31: Grader Use Case Prioritized Scope

Objective: Support common and critical assertions in AI-generated graders (static analysis).

### Tasks
- [x] **Syntax Support**:
    - [x] Add explicit handlers for `@starting-style` and `@view-transition` in `src/parser.ts`.
    - [x] Ensure robust parsing of `:has()` and `:popover-open` in selector parser.
    - [x] **Extract Fixtures from WPT**: Extracted test cases for `anchor()`, `anchor-size()`, `@starting-style`, `@view-transition`, `:has()`, and `:popover-open` into `tests/fixtures/wpt/wpt-modern-features.json`.
- [ ] **Capabilities**:
    - **Static Selector Matching**: (On hold) Implement a basic matcher to evaluate a parsed selector against a DOM element (e.g., for use with `linkedom`).
    - [x] **Specificity & Cascade Resolution**:
        - [x] Add tests for specificity calculation. (Spec: `selectors-4 #specificity-rules`)
        - [x] Implement structured selector parser.
        - [x] Implement `CSS.calculateSpecificity` function. (Spec: `selectors-4 #specificity-rules`)
        - [x] Implement `getCascadedStyle` using specificity and `linkedom`'s `matches()`.
        - [x] Refactor custom utilities (`getCascadedStyle`, `calculateSpecificity`, `resolveVariables`) to static methods on `Parser` class.
    - [x] **Value Resolution**: Provide a utility to read resolved values handling `var()` fallbacks.
## Phase 32: Conformance Cleanup & Modern Feature Validation

Objective: Fix preflight errors and validate modern CSS features by unskipping and fixing tests.

### Tasks
- [x] **Fix Preflight Errors**:
    - [x] Fix missing imports and type errors in `tests/selectors-modern.test.ts`.
    - [x] Fix type errors in `tests/starting-style-view-transition.test.ts`.
- [x] **Unskip and Validate Modern CSS Tests**:
    - [x] Unskip and verify `tests/starting-style-view-transition.test.ts`.
    - [x] Unskip and verify `tests/selectors-modern.test.ts`.
    - [x] Unskip and verify `tests/modern-features.test.ts` (anchor, sibling-index, etc.).
    - [x] Improve `the tests/typed-om-wpt.test.ts` with explicit skip rationales.
    - [x] Implement `CSSTransformValue.parse()` and `CSSStyleValue.parse()` to improve WPT coverage.
    - [x] Ensure all tests pass in preflight.

## Phase 33: Circular Dependency Resolution & Typed OM Consolidation

Objective: Resolve circular dependencies between `Parser` and `Typed OM` and lock down the API surface.

### Tasks
- [x] **Resolve Circular Dependencies**: Used Dependency Inversion via `ParseHooks` to inject parser implementations into Typed OM classes.
- [x] **API Lockdown**: Added `tests/api-surface.test.ts` to lock down the API surface.
- [x] **Documentation**: Documented spec boundaries in `API_BOUNDARIES.md`.

## Phase 34: Static Selector Matching Enhancements

Objective: Enhance `getCascadedStyle` to support modern CSS features needed for graders.

### Tasks
- [x] **Support CSS Nesting in Cascade**: Resolved `&` in nested selectors to `:is(parentSelector)` to allow `linkedom`'s `matches()` to work correctly.
- [x] **Expand resolveVariables**: Support layout-independent resolution for other modern functions like `env()`.

## Phase 35: Spec Compliance Audit Remediation

Objective: Address non-compliance issues, missing features, and technical debt identified in the spec compliance audit report and verified by the Scrutineer.

### Parser API
- [x] **Return Type Discrepancies**: Fix `parseDeclaration`, `parseValue`, etc. to be synchronous as per IDL.
- [x] **Remove Extra Proprietary API**: Remove `*Sync` methods from the `CSS` object export.
- [x] **Support ReadableStream**: Update async methods to accept `ReadableStream` in `CSSStringSource`.
- [x] **Implement `atRules` option**: Plumb `options.atRules` down to `Parser.consumeAtRule`.
- [x] **Align Types**: Align `prelude` and `body` attributes with `FrozenArray<CSSParserValue>`.
- [x] **Address `CSSParserRawValue`**: Resolve technical debt regarding raw tokens in strictly typed arrays.

### Logical Properties
- [x] **Add Missing Shorthands**: Implement `inset-block`, `inset-inline`, `border-block-*`, etc.
- [x] **Add `border-radius` mappings**: Complete `LOGICAL_MAPPING` in `src/data/gen/LogicalMapping.ts`.
- [x] **Fix Shorthand Serialization**: Refactor to recursively condense properties (implemented `border` and side-condensers).
- [x] **Precedence in `all`**: Ensure physical properties win over logical properties in `all` expansion.

### CSS Nesting
- [x] **Parse `&` in Selector Parser**: Add `NestingSelector` node and parse `delim(&)`.
- [x] **Fix `&` Specificity**: Compute specificity of `&` as largest specificity of parent rule's selector list.
- [x] **Complete Combinator Detection**: Add `||` combinator check in `startsWithCombinator`.
- [x] **Refactor Nesting Expansion**: Move away from regex replacement in `cascade.ts`.

### Media Queries
- [x] **Validate Media Feature Values**: Introduced `FEATURE_ALLOWED_IDENTS` in `MediaParser.ts`.
- [x] **Support Negative Range Features**: Implemented semantic checks for negative values in range features.

### Properties & Variables
- [x] **Fix Empty Custom Property Serialization**: Serialize with a single space.
- [x] **Harden `var()` Grammar Validation**: Validate comma separation for fallbacks.
- [x] **Implement `CSS.registerProperty()`**: Add the JS API with validation.
- [x] **Validate `@property` Syntax**: Validate the `syntax` descriptor string.
- [x] **Validate `@property` Initial Value**: Check against syntax and for computational independence.
- [x] **Case-Sensitivity in `CSSStyleDeclaration`**: Convert standard properties to lowercase.
- [x] **Fix `CSSPropertyRule.cssText` Serialization**: Use structured serialization instead of `JSON.stringify`.

### Values & Typed OM
- [x] **Add Math Constants**: Support `e` and `pi` in `math-parser.ts`.
- [x] **Refactor Multi-argument Math Functions**: Fix `atan2()` argument handling in AST.
- [x] `CSSNumericValue.parse()`
- [x] `type()`
- [x] `to()`
- [x] `toSum()`
- [x] `CSSStyleValue.parseAll()`
- [x] **Fix Subclass Properties**: Rename `children` to `values`, `child` to `value`, and fix `CSSMathClamp` properties.
- [x] **Implement Iterators & List Interfaces**: `CSSNumericArray`, `CSSTransformValue` iterable, etc.
- [x] **Add Missing Subclasses**: `CSSImageValue`, Color values.

### CSS Syntax
- [x] **Fix `consume an ident-like token`**: Do not inappropriately consume whitespace in `url()`.
- [x] **Add `sign character` on numeric tokens**: Add `sign` property to `Token` interface.
- [x] **Add EOF Parse Error Logging**: For implicitly closed URLs.

### CSSOM
- [x] **Separate `CSSStyleProperties`**: Move DOM accessors to separate interface.
- [x] **Enforce `@import` Restriction**: Throw error when inserting `@import` into constructed stylesheets.
- [x] **Enforce `replace()` Constraints**: Check flags and filter `@import`.
- [x] **Implement Fallback in `insertRule`**: Fallback to declaration block parsing in grouping rules.
- [x] **Correct `@namespace` Error Types**: Throw `InvalidStateError` when appropriate.
- [x] **Validate `setProperty` Priority**: Return early if priority is invalid.
- [x] **Fix `removeProperty` Return Value**: Return correct serialization for shorthands.
- [x] **Fix Serialization Formatting**: Implement proper indentation and newlines.
- [x] **Retire `CSSUnknownRule`**: Align with modern spec by removing it if appropriate.

### Selectors
- [x] **Implement Namespace Support**: Handle `|` delimiter in type and attribute selectors.
- [x] **Preserve `:nth-child()` Arguments**: Do not lose formula tokens when `of` is present.
- [x] **Enforce Pseudo-Element Sequencing**: Restrict what can follow a pseudo-element.
- [x] **Fix Top-Level Specificity**: Return independent specificities for top-level selector list.

## Phase 36: Bundling & Distribution

Objective: Bundle the package into a single file with types using `tsup`.

### Tasks
- [x] **Install `tsup`**: Add `tsup` as a dev dependency.
- [x] **Configure `tsup`**: Add build script to `package.json` and update exports.
- [x] **Verify Build**: Run the build and ensure output is correct. Added `tests/dist.test.ts` to validate.

## Phase 37: Code Simplification & Technical Debt Reduction

Objective: Address technical debt, memory leaks, and performance inefficiencies identified in the code simplifier review.

### `src/parser.ts`
- [x] **Fix Closure Leaks**: Refactor `atRuleHandlers` to avoid per-instance allocations.
- [x] **Optimize Variable Resolution**: Cache parsed AST of custom properties to avoid redundant tokenization.
- [x] **Encapsulate `ComponentValue[]` Iteration**: Wrap in a stream abstraction.
- [x] **Deduplicate Skip Logic**: Extract `skipToNextSemicolonOrBlock()` helper.
- [x] **Use Category Guards**: Refactor `atRuleHandlers` to use category checks instead of hardcoded lists.
- [x] **Move `getOriginalText`**: Abstract into `src/serializer.ts`.

### `src/serializer.ts`
- [x] **Avoid Re-tokenization**: Combiners should return strings directly without re-tokenizing.
- [x] **Fix $O(N^2)$ Searches**: Precompute indices for `checkIntervening`.
- [x] **Avoid Garbage Generation**: Hoist `Object.entries` calls outside loops.
- [x] **Reuse `shorthands.ts`**: Refactor to use `SHORTHANDS` registry.
- [x] **Remove Hardcoded Magic Strings**: Address root causes of serialization differences.

### `src/MediaParser.ts`
- [x] **Use `units.ts`**: Import `unitToBase` to validate dimensions correctly.

## Phase 38: Spec Compliance Audit Remediation

Objective: Address non-compliance issues, missing features, and technical debt identified in the second spec compliance audit report and verified by the Scrutineer.

### CSS Logical Properties
- [x] **Deferred Aliasing**: Move logical property mapping from `CSSStyleDeclaration` to cascade resolution.
- [x] **Respect Cascade Order**: Remove physical-wins-over-logical hardcoding in tie-breakers.
- [x] **Add Missing Border Shorthands**: Implement `border-block-*` side shorthands in `SHORTHANDS`.
- [x] **Fix `border-radius` Parsing**: Disallow `logical` keyword and support `/` separator.
- [x] **Add Missing Scroll Shorthands**: Add `scroll-padding` and `scroll-margin` to `SHORTHANDS`.
- [x] **Cleanup Serializer Debt**: Remove `border-block` from `genericShorthands`.

### Selectors
- [x] **Enforce Type Selector Position**: Ensure type selectors only appear first in compound selectors.
- [x] **Contextualize Relative Selectors**: Restrict leading combinators to `:has()` contexts.
- [x] **Validate Pseudo-element Positioning**: Restrict pseudo-elements to final compound selectors.

### Properties & Variables
- [x] **Add `<string>` Syntax**: Support `<string>` component in validation.
- [x] **Harden `<custom-ident>`**: Exclude CSS-wide keywords and enforce case-sensitivity.
- [x] **Add `q` Unit**: Include `q` in computational independence checks.
- [x] **Strict `@property` Prelude**: Reject extraneous tokens in prelude.
- [x] **Reject `--` as Property Name**: Enforce that `--` by itself is invalid.
- [x] **Validate `var()` Fallback Commas**: Ensure fallbacks are comma-separated.

### CSS Nesting
- [x] **Fix `CSSStyleRule` Serialization**: Implement proper indentation and newlines for child rules.

### CSSOM
- [x] **Correct Hierarchy**: Swap inheritance so `CSSStyleDeclaration` extends `CSSStyleProperties` (or separate properly).
- [x] **Add Missing Core Interfaces in types.ts**: Add `CSSImportRule`, `CSSNamespaceRule`, etc.
- [x] **Add Security Checks**: Enforce `disallow modification flag` in `replaceSync()`.
- [x] **Escape `@import` URLs**: Use `serializeString` in `CSSImportRule.cssText`.
- [x] **Refactor `CSSStyleSheet` Constructor**: Remove non-standard signatures.
- [x] **Avoid DOM Bleed**: Use `unknown` instead of `Node` for `ownerNode`.

### Media Queries
- [x] **Support Math Functions**: Accept `calc()` and other math functions in media features.
- [x] **Correct Negative Range Error Handling**: Allow valid negative lengths to parse successfully.
- [x] **Validate `<ratio>` Values**: Reject negative values in aspect ratios.
- [x] **Whitespace Sensitivity in Operators**: Prevent conflation of separated tokens like `< =`.
- [x] **Enforce `<mf-value>` Boundaries**: Reject trailing garbage in feature values.

### Values & Typed OM
- [x] **Rename `CSSMathClamp` Properties**: Use `lower`, `value`, and `upper`.
- [x] **Throw Exceptions on Parse Fail**: Throw `TypeError` / `SyntaxError` instead of returning `null`.
- [x] **Replace `CSSNumericNode`**: Use standard `CSSUnitValue` instead of custom wrapper.
- [x] **Support `round()` Strategy Keywords**: Parse and store `<rounding-strategy>`.
- [x] **Add Missing Color Subclasses**: Implement `CSSHWB`, `CSSLab`, etc.

### CSS Syntax
- [x] **Update Percentage Token Type**: Remove `numberType` flag if appropriate.
- [x] **Move to Single-Pass Block Parsing**: Refactor away from two-pass `ComponentValue` streams.
- [x] **Fix Block Error Recovery**: Consume entire block when failing to parse rules/declarations in blocks.
- [x] **Preserve CDO/CDC in Blocks**: Treat them as regular tokens in block recovery.
- [x] **Handle Nested Bad Declarations**: Implement `consume the remnants of a bad declaration`.

## Phase 39: Spec Compliance Audit Remediation [x]

Objective: Address non-compliance issues, missing features, and technical debt identified in the spec compliance audit report and verified by the Scrutineer.

### CSS Logical Properties
- [x] **Add Missing Border Shorthands**: Implement `border-inline-start/end`, `border-block`, and `border-inline` in `SHORTHANDS`.
- [x] **Add Missing Serialization**: Implement `tryCombineBorderInline` in `serializer.ts`.
- [x] **Fix Mixed Overrides**: Return empty string for shorthands with mixed physical/logical overrides in `getPropertyValue()`.

### Selectors Level 4
- [x] **Forgiving Selector List**: Support `<forgiving-selector-list>` in `:is()` and `:where()` to ignore invalid items instead of throwing.
- [x] **Reject Consecutive/Trailing Combinators**: Enforce strict combinator grammar in `consumeComplexSelector`.
- [x] **Harden `:has()`**: Prevent nesting `:has()` and pseudo-elements inside `:has()`.
- [x] **Support `:matches()` Parsing**: Parse `:matches()` arguments as selector lists to fix specificity.

### CSS Properties & Variables
- [x] **Enforce Case-Sensitivity**: Remove `.toLowerCase()` in `matchesSyntax` for ident literals.
- [x] **Strict `--` Name Exclusion**: Reject `--` by itself in all property name checks.
- [x] **Support Viewport Units in Houdini**: Add viewport units to computationally independent checks.

### CSSOM Core
- [x] **Correct Hierarchy**: Swap inheritance so `CSSStyleDeclaration` extends `CSSStyleProperties` (or separate properly).
- [x] **Restore `url()` Wrapper**: Fix `CSSImportRule.cssText` to include `url()` wrapper around serialized URL.
- [x] **Fix Nested Rules Formatting**: Indent child rules with newlines and spaces in `CSSStyleRule.cssText`.
- [x] **Serialize Keyframes Name**: Use `serializeIdentifier()` on animation name in `CSSKeyframesRule.cssText`.

### Media Queries Level 4
- [x] **Correct Negative Range Rejection**: Remove `isNegative()` check from `validateMediaInParens`.
- [x] **Add Validation in Range Contexts**: Call `matchesType()` and check boundaries in `parseRangeContext`.

### CSS Values & Typed OM
- [x] **Throw TypeError on Parse Fail**: Throw `TypeError` instead of falling back to `CSSUnparsedValue` in `CSSStyleValue.parse`.
- [x] **Add `CSSColor` Wrapper**: Implement `CSSColor` and `CSSColorValue.parse()`.
- [x] **Correct Type Resolution**: Preserve dimension type in `abs()` and `hypot()`.
- [x] **Fix Operator Enum Violation**: Ensure `operator` returns standard enum values.

### CSS Syntax
- [x] **Fix Error Recovery in Blocks**: Prevent over-consuming tokens on invalid rules to avoid dropping valid declarations.
- [x] **Robust `@import` Parsing**: Parse `layer()` and `supports()` in `@import` prelude.
- [x] **Add Error Reporting**: Emit parse errors instead of swallowing them.

### CSS Nesting
- [x] **Integrate `CSSNestedDeclarations` in Cascade**: Apply properties from `CSSNestedDeclarations` in `cascade.ts`.
- [x] **Resolve Root-Level `&`**: Resolve `&` to `:scope` when no parent rule exists.

### Test Cleanup & Enhancement
- [x] **Fuzzing Enhancements**: Move `the tests/fuzz.ts` to a subfolder (e.g., `the tests/fuzz/`) and augment it to fuzz more areas (Typed OM, Media Queries, etc.).
- [x] **Investigate Fuzzer Errors**: Investigate the 'Newline reached before string was closed' errors found by `fuzz-codebase.test.ts` when scanning the target directory.
- [x] **Clean Up `phase35` Test Files**: Relocate tests from `tests/phase35*.test.ts` to existing files or better-named files.
- [x] **Clean Up `wpt_*` Files**:
    - [x] Move `the tests/wpt_bulk_verify.ts` to `scripts/` (since it is a bulk check, not a unit test).
    - [x] Rename `the old tests/wpt_serialize_values.ts` to `tests/wpt-values.test.ts` to match naming conventions.

## Phase 40: Build-Time Code Generation for Hardcoded Lists

Objective: Implement build-time code generation scripts to extract data from `mdn-data` and `@webref/css` and generate static lookup tables/types, eliminating hardcoded lists while maintaining zero runtime dependencies.

### Tasks
- [x] **Centralize Unit Definitions**: Create a local JSON/YAML configuration file for all CSS units. To maximize coverage, build this list by combining (a) the base list from `mdn-data`, (b) targeted regex extraction of units from `submodules/csswg-drafts/css-values-4/Overview.bs` and `css-contain-3`, and (c) an empirical scan of dimension tokens in the WPT submodule.
- [x] **Generate Units & Mappings**: Write a script to generate `src/data/gen/units.ts` (mappings like `unitToBase`) and the `CSSUnit` type in `src/typed-om.ts` from the centralized local config.
- [x] **Generate Shorthands**: Write a script to extract shorthand mappings from `mdn-data`'s `css.properties` (where `"initial"` is an array of strings) and generate `src/data/gen/shorthands.ts`.
- [x] **Generate Properties**: Write a script to extract property names from `@webref/css`'s properties array and generate the `CSSStyleProperties` interface in `src/data/gen/properties.ts`.
- [x] **Generate Logical Mappings**: Write a script to generate `LOGICAL_MAPPING` in `src/data/gen/LogicalMapping.ts` by parsing `syntax` and `logicalPropertyGroup` metadata from `@webref/css`.
- [x] **Generate Media Features**: Write a script to generate media feature maps (`KNOWN_FEATURES`, `FEATURE_VALUE_TYPES`, etc.) in `src/data/gen/media-features.ts` by extracting data from `@webref/css`'s `atrules` export for `@media`.
- [x] **Generate Selectors**: Write a script to generate pseudo-class and pseudo-element lists in `src/data/gen/selectors.ts` from `mdn-data`'s `css.selectors`.
- [x] **Generate Math Functions**: Write a script to extract math functions from `@webref/css`'s `functions` list and generate the `MATH_FUNCTIONS` array in `src/data/gen/math-functions.ts`.

## Phase 41: Isolate Generated Data

Objective: Move all generated data files from implementation directories to a dedicated `src/data/gen/` directory to clearly delineate machine-generated data from human-authored code.

### Tasks
- [x] **Create `src/data/gen/` directory**: Create the directory if it doesn't exist.
- [x] **Move Generated Data Files**:
    - Move generated unit mappings to `src/data/gen/units.ts`.
    - Move `the old src/LogicalMapping.ts` to `src/data/gen/LogicalMapping.ts`.
    - Separate generated shorthand mappings from manual expansion logic in `src/shorthands.ts` and move data to `src/data/gen/shorthands.ts`.
- [x] **Update Imports**: Update all files referencing these generated data files to use the new paths under `src/data/gen/`.
- [x] **Update Generation Scripts**: Update the scripts in `scripts/` to output to `src/data/gen/` instead of `src/`.
- [x] **Verify**: Run `pnpm run preflight` to ensure everything still works and types are correct.

## Phase 42: Refactor Code Generation & Isolate Data (Grizzled Mandate)

Objective: Apply Grizz's Principal Engineer mandate to clean up the code generation architecture.

### Tasks
- [x] **True Data Isolation**: Update all `scripts/generate_*.ts` to output exclusively to pure data files in `src/data/`. They are strictly forbidden from reading or modifying `src/**/*.ts` implementation files.
- [x] **Use TypeScript Derivations**: Replace regex injections with `as const` arrays and `typeof ARRAY[number]` derivations for union types.
- [x] **Add Header Tags**: Ensure all generated files start with `// @generated`.
- [x] **Clean Imports**: Update implementation files to import generated constants and remove hardcoded arrays.
- [x] **Verify Build Stability**: Ensure schema changes in upstream packages are handled safely and do not crash the build.
- [x] **Verify**: Run `pnpm run preflight` to ensure everything still works.

## Phase 43: Codegen Organization & Entry Point

Objective: Organize code generation scripts into a subfolder and provide a single entry point to run all of them.

### Tasks
- [x] **Create `scripts/codegen/` directory**: Created the directory.
- [x] **Move Scripts**: Moved all `generate_*.ts` scripts from `scripts/` to `scripts/codegen/`.
- [x] **Create Master Script**: Created `scripts/generate_all.ts` that runs all scripts in `scripts/codegen/` sequentially.
- [x] **Add Npm Script**: Added a `codegen` script to `package.json` that invokes the master script.
- [x] **Verify**: Ran `pnpm run codegen` and ensured all data files are correctly generated in `src/data/`.

## Phase 44: Harden Code Generation (Eliminate Hardcoding)

Objective: Remove remaining hardcoded lists in codegen scripts and update generated file headers.

### Tasks
- [x] **Update Generated Headers**: Update all generation scripts to include the specific script name in the `// @generated by scripts/codegen/blahblah.ts. Do not edit.` header.
- [x] **Eliminate Hardcoding in Scripts**: Investigate if hardcoded lists in scripts (like unit mappings, factors, manual shorthand logic) can be derived from specs or packages.
- [x] **Compare Diffs**: If hardcoding is removed, verify if it creates a diff in the generated data files. Report the findings.

## Phase 45: Spec Compliance Remediation (Validated Findings) [x]

Objective: Address spec compliance issues, missing features, and technical debt validated by the Scrutineer in the latest audit report.

### Tasks
- [x] **CSS Nesting: `CSSNestedDeclarations` Serialization**: Filter out empty strings before joining in `CSSStyleRule.cssText` and `serializeGroupingRule`.
- [x] **CSS Nesting: Remove Redundant `&` Validation**: Remove manual check in `normalizeNestedSelector` and rely on `SelectorParser`.
- [x] **CSS Nesting: `@scope` Support**: Add dedicated handler to absolutize `&` in `@scope` prelude.
- [x] **Variables: Case-Sensitive Custom Idents**: Match ident literals case-sensitively in `matchesSyntax`.
- [x] **Variables: Syntax String Parsing**: Refactor to use proper tokenizer instead of `.split('|')`.
- [x] **Variables: Strict dashed-ident Check**: Enforce strict `<dashed-ident>` parsing for custom property names.
- [x] **Variables: `DOMException` Usage**: Replace generic `SyntaxError` with `DOMException`.
- [x] **Variables: Custom Property Declaration Value Constraints**: Add top-level semicolon rejection.
- [x] **Variables: Custom Property Declaration Value Constraints**: Adjust `var()` fallback constraints.
- [x] **Syntax: Tokenizer Comment Handling**: Consume comments before whitespace loop to avoid incorrect merging.
- [x] **Syntax: `consumeRule()` Leading Whitespace**: Discard leading whitespace in `consumeRule()`.
- [x] **Syntax: `!important` Whitespace**: Stop stripping whitespace preceding `!` in `consumeDeclarationFromStream()`.
- [x] **Syntax: Lone Block in Declaration**: Correctly allow lone blocks without other non-whitespace content in declarations.
- [x] **Logical Properties: `all` Override Priority**: Enforce physical last override priority for `all` shorthand.
- [x] **Selectors: Trailing Garbage Rejection**: Reject unconsumed tokens in unforgiving mode.
- [x] **Selectors: Forgiving List Cleanup**: Drop invalid complex selectors from `:is()` and `:where()`.
- [x] **Selectors: Ambiguity Resolution**: Fix lookahead for column combinator vs namespace prefix.
- [x] **Selectors: Pseudo Identifier Validation**: Validate pseudos against generated lists.
- [x] **Selectors: Relax Pseudo-element Check**: Allow tree-abiding ones after `::slotted()` or `::part()`.
- [x] **Selectors: Argument Parsing**: Recursively parse arguments of `slotted`, `host`, and `host-context`.
- [x] **Typed OM: Bogus Units Rejection**: Reject unrecognized units in `CSSNumericValue.parse()`.
- [x] **Typed OM: `CSSMathValue` Parsing**: Support parsing math functions properly without eager lossy simplification.
- [x] **CSSOM: Rule List Reallocation**: Fix re-instantiation of underlying array.
- [x] **CSSOM: `NoModificationAllowedError`**: Use this DOMException for readonly properties.
- [x] **CSSOM: `removeProperty('all')`**: Fix to return correct value before removal.

## Phase 46: Spec Compliance Remediation [x]

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 4 audit report and validated by the Scrutineer.

### Tasks
- [x] **CSS Nesting: Shallow Search for `&`**: Implement recursive `containsAmpersand` helper in `normalizeNestedSelector` to find ampersands inside functions like `:is(&)`.
- [x] **CSS Nesting: Invalid Context in `insertRule`**: Pass `true` to `nested` parameter in `Parser.parseRuleInBlockText`.
- [x] **CSS Nesting: Deprecated Type Enum**: Remove `CSSRule.NESTED_DECLARATIONS_RULE = 17` and return `0` for new rules.
- [x] **Variables: `var()` first argument**: Relax restriction in `validateCustomPropertyValue` to allow nested `var()`.
- [x] **Variables: Universal syntax `*`**: Skip computational independence check if `syntax === '*'`.
- [x] **Variables: `+` multiplier**: Ensure `tokens.length > 0` before evaluating `.every()` for `+` multiplier.
- [x] **Variables: `transform` catch-alls**: Implement proper validation for `<transform-function>` and `<transform-list>`.
- [x] **Variables: Reserved Keywords in Custom Idents**: Reject CSS wide keywords as literal identifiers in syntax strings.
- [x] **Variables: Unquoted `syntax`**: Enforce that value of `syntax` descriptor in `@property` is a string token.
- [x] **Syntax: Incorrect Declaration Flushing**: Delay `flushDecls()` in `consumeBlockContents()` until after checking if rule parsed successfully.
- [x] **Syntax: Missing Bad Declaration Recovery**: Invoke `consumeRemnantsOfABadDeclaration()` in `consumeQualifiedRule()` on `--` prefix check error.
- [x] **Syntax: `consumeRemnantsOfABadDeclaration` handling of `}`**: Accept `nested` flag and break on `}` if true.
- [x] **Syntax: CDO/CDC in Non-Top-Level Rules**: Do not discard CDO/CDC tokens when `topLevel` is false; let `consumeRule()` pick them up.
- [x] **Logical Properties: Reverse Overlap Checks**: Check if physical longhands are mixed in for logical shorthands in `getPropertyValue()`.
- [x] **Logical Properties: `border-radius` Missing Logical Longhands**: Add them to `border-radius` shorthand definition.
- [x] **Selectors: Specificity Calculation**: Add argument's specificity for `:host()`, `:host-context()`, and `::slotted()`.
- [x] **Selectors: Pseudo-elements in Logical Pseudos**: Forbid pseudo-elements inside `:is()`, `:where()`, and `:not()`.
- [x] **Selectors: ID Selectors Hash Type**: Throw error if `hashType` is not `'id'` for ID selectors.
- [x] **Selectors: Attribute Selector Parsing**: Enforce flags to be `i` or `s` and throw error on trailing garbage in attribute selectors.
- [x] **Typed OM: Bogus Units Rejection**: Reject unrecognized units in `CSSNumericValue.parse()`.
- [x] **Typed OM: Eager/Lossy Simplification**: Support parsing math functions properly without eager lossy simplification.
- [x] **Typed OM: Arithmetic Type Checking & Folding**: Implement eager type checking and fold values of matching types in arithmetic operations.
- [x] **Typed OM: `CSSMathSum.type()` Derivation**: Refactor to iterate and validate consistency across all children.
- [x] **Typed OM: `CSS` Factory Namespace**: Autogenerate factory methods based on `UNITS` array.
- [x] **Typed OM: `operator` Fallbacks**: Document spec gap for new math functions or extend enum.
- [x] **CSSOM: Missing Legacy Members**: Add `rules`, `addRule()`, `removeRule()` to `CSSStyleSheet`.
- [x] **CSSOM: `StyleSheetList.item()` Return Type**: Return `CSSStyleSheet` instead of `StyleSheet` in `types.ts`.
- [x] **CSSOM: Inverted Inheritance**: Reverse inheritance in `types.ts` so `CSSStyleProperties` extends `CSSStyleDeclaration`.
- [x] **CSSOM: Incorrect `style` Return Types**: Update to return specialized descriptor interfaces on at-rules.
- [x] **CSSOM: Missing `readonly` Modifiers**: Add to properties in `types.ts` and `CSSOM.ts` where mandated by IDL.
- [x] **CSSOM: `CSSRule` Constants**: Split into instance and constructor interfaces in `types.ts`.
- [x] **CSSOM: `setProperty` Signature in `types.ts`**: Update `value` to `string | null` for `LegacyNullToEmptyString`.
- [x] **Media Queries: `not` Modifier Precedence**: Move `if (isNot)` block to execute AFTER `evalAnd` block in `MediaParser.ts`.
- [x] **Media Queries: Technical Debt Removal**: Remove `NON_NEGATIVE_FEATURES` and `isNegative()` dead code.

## Phase 47: Code Simplification & Refactoring [x]

Objective: Apply refactors and simplifications identified in the Code Simplifier review to reduce duplication and technical debt in `src/parser.ts`.

### Tasks
- [x] **Extract `isCustomPropertyDeclaration`**: Unify lookahead logic checking for `--ident:` in `consumeQualifiedRule` and `consumeNestedQualifiedRuleFromStream`.
- [x] **Extract `consumeSelectorTokens`**: Extract identical `while` loops in `parseSelector` and `parseSelectorAST`.
- [x] **Import `getMirrorToken`**: Remove duplicate method in `parser.ts` and import from `serializer.ts`.

## Phase 48: Spec Compliance Remediation [x]

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 5 audit report.

### Tasks
- [x] **Nesting: Missing `flushDecls()` on Invalid Rule**: Add `flushDecls()` before `consumeRemnantsOfABadDeclaration`.
- [x] **Nesting: Unnested Group Rules**: Branch `consumeNestedRules` based on `nested` flag to parse as `<rule-list>` if false.
- [x] **Variables: `var()` first argument**: Relax restriction in `validateCustomPropertyValue` to allow nested `var()`.
- [x] **Variables: Universal syntax `*`**: Skip computational independence check if `syntax === '*'`.
- [x] **Variables: `+` multiplier**: Ensure `tokens.length > 0` before evaluating `.every()`.
- [x] **Variables: `transform` catch-alls**: Implement proper validation for `<transform-function>` and `<transform-list>`.
- [x] **Variables: Reserved Keywords in Custom Idents**: Reject CSS wide keywords as literal identifiers in syntax strings.
- [x] **Variables: Unquoted `syntax`**: Enforce that value of `syntax` descriptor in `@property` is a string token.
- [x] **Syntax: Incorrect Loop Termination**: Remove `break;` statement in `else` branch for `}` condition in `consumeRemnantsOfABadDeclaration`.
- [x] **Syntax: Invalid Parameter Forwarding**: Strictly use `true` in fallback invocation of `consumeRemnantsOfABadDeclaration` in `consumeBlockContents`.
- [x] **Syntax: Custom Property Fast-Path Violation**: Honor `nested` flag using Lazy stream in `consumeQualifiedRule`.
- [x] **Syntax: Spec-Violating Heuristics**: Remove length-2 check block completely in `consumeQualifiedRule`.
- [x] **Syntax: Missing Parse Errors**: Add explicit `this.reportError` calls in `consumeQualifiedRule` and `consumeAtRule`.
- [x] **Logical Properties: Reverse Overlap Checks**: Check if physical longhands are mixed in for logical shorthands in `getPropertyValue()`.
- [x] **Logical Properties: `border-radius` Missing Logical Longhands**: Add them to `border-radius` shorthand definition.
- [x] **Selectors: Missing Validation for Empty Lists**: Throw `SyntaxError` if unforgiving and empty.
- [x] **Selectors: Empty Complex Selectors**: Throw `SyntaxError` if items length is 0.
- [x] **Selectors: Context Flag Bypass**: Propagate parent context arguments in sub-parsers.
- [x] **Selectors: Flawed Forgiving Parser Error Recovery**: Simplify forgiving logic.
- [x] **Selectors: Missing Obsolete `-webkit-` Quirks**: Unconditionally allow non-functional ones starting with `-webkit-`.
- [x] **Typed OM: Missing Default Attributes in Transforms**: Set spec-mandated default values for 2D variants.
- [x] **Typed OM: Missing `toMatrix()`**: Add required `DOMMatrix toMatrix()` method to `CSSTransformComponent`.
- [x] **Typed OM: Over-Parsing of Math Functions**: Filter codegen script to strictly include only standard math functions.
- [x] **Typed OM: `CSSStyleValue.parseAll` List Separation**: Subdivide tokens according to property grammar.
- [x] **Typed OM: Incorrect Fallback to `CSSUnparsedValue`**: Return generic `CSSStyleValue` instead.
- [x] **CSSOM: Non-compliant Types in `StyleSheet`**: Update `types.ts` to use spec-compliant types.
- [x] **CSSOM: `MediaList` Copied by Reference**: Always construct a new `MediaList` in `CSSStyleSheet` constructor.
- [x] **CSSOM: `addRule()` Ignores `"undefined"`**: Remove `style !== 'undefined'` check.
- [x] **CSSOM: Inverted Inheritance**: Reverse inheritance in `types.ts`.
- [x] **CSSOM: Incorrect `style` Return Types**: Update to return specialized descriptor interfaces on at-rules.
- [x] **CSSOM: Missing `readonly` Modifiers**: Add to properties in `types.ts` and `CSSOM.ts`.
- [x] **Media Queries: Unit Serialization**: Add lowercase coercion for units.

## Phase 49: Resolve Remaining Logical Property Failures [x]

Objective: Resolve the 3 remaining test failures in `tests/logical-shorthand.test.ts` and `tests/logical-overlap.test.ts` related to complex physical/logical property interactions.

### Tasks
- [x] **Fix `CSSOM: The all shorthand and logical properties tie-breaker`**: Ensure correct precedence when `all` is mixed with logical properties.
- [x] **Fix `Physical shorthand border-radius getPropertyValue with mixed logical longhands`**: Fix serialization when physical shorthands contain logical longhands.
- [x] **Fix `logical shorthand serialization with mixed physical longhands`**: Fix serialization when logical shorthands contain physical longhands.

## Phase 50: Spec Compliance Remediation

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 6 audit report.

### Tasks
- [x] **Nesting: Uncaught DOMException Crash**: Wrap `element.matches()` in a `try...catch` block inside `getMatchingSpecificity()`. (High Priority).
- [x] **Nesting: Serialization of Invalid Forgiving Selectors**: Preserve invalid items containing `&` in `<forgiving-selector-list>` during error recovery.
- [x] **Variables: Missing `InvalidModificationError` on Duplicate Registration**: Add check and throw error.
- [x] **Variables: Missing `TypeError` for Missing `inherits` Flag**: Explicitly check and throw `TypeError`.

- [x] **Variables: Missing `<declaration-value>?` Validation for Universal Syntax (`*`)**: Parse `initialValue` as `<declaration-value>?` if present.

- [x] **Syntax: Technical Debt removal of `consumeListOfRulesFromValues`**: Deprecate and use `consumeBlockContents` instead.
- [x] **Syntax: `parseRule` ignores trailing garbage**: Add check for `EOF` after parsing a rule.
- [x] **Syntax: Missing Entry Points**: Implement comma-separated list parsers.
- [x] **Syntax: Missing Entry Points**: Expose `parseDeclaration` and `parseComponentValue`.
- [x] **Logical Properties: Static Mapping in Cascade**: Dynamically resolve mapping based on computed writing mode.

- [x] **Logical Properties: Flawed Override Resolution**: Return empty string `""` when there is a mix of physical and logical longhands.
- [x] **Logical Properties: `inset-block` Serialization Hack Removal**: Remove the hack previously added in Phase 49.
- [x] **Logical Properties: `border` Shorthand Omission**: Add `border` shorthand to `SHORTHANDS` dictionary.
- [x] **Logical Properties: `border-radius` Recombination Missing**: Add `border-radius` to `tryCombineBoxShorthand`.
- [x] **Selectors: Missing Validation for Empty Lists**: Throw `SyntaxError` if unforgiving and empty.
- [x] **Selectors: Empty Complex Selectors**: Throw `SyntaxError` if items length is 0.
- [x] **Selectors: Context Flag Bypass**: Propagate parent context arguments in sub-parsers.
- [x] **Selectors: Flawed Forgiving Parser Error Recovery**: Simplify forgiving logic.
- [x] **Selectors: Missing Obsolete `-webkit-` Quirks**: Unconditionally allow non-functional ones starting with `-webkit-`.
- [x] **Typed OM: Incomplete Eager Simplification**: Handle advanced math functions in `simplify()`.
- [x] **Typed OM: Missing `CSSMathClamp` Support**: Add condition block for `CSSMathClamp` in `createSumValue()`.
- [x] **Typed OM: Missing Unit Canonicalization in Min/Max/Clamp**: Map to canonical units prior to evaluating.
- [x] **Typed OM: `CSSNumericValue.parse` Does Not Eagerly Simplify**: Wrap returned node in `simplify()`.
- [x] **Typed OM: `CSSMathOperator` Fallback**: Expose actual function name instead of `'sum'`.
- [x] **CSSOM: `CSSStyleSheet.addRule` Default Argument Fix**: Revert default `style` argument to `"undefined"`.
- [x] **CSSOM: Missing Stringifier on `MediaList`**: Implement `toString()` method returning `mediaText`.
- [x] **CSSOM: Missing Implicit Iterables**: Implement `[Symbol.iterator]()` on collections.
- [x] **CSSOM: `CSSStyleSheetInit` Type Export & Nullability**: Update type and export it.
- [x] **Media Queries: Unit Serialization**: Add lowercase coercion for units.

## Phase 51: Fix Percentage Keyframes Bug [x]

Objective: Allow parsing of percentage keyframes like `0% { ... }` in `@keyframes` rules, which are currently dropped as invalid selectors.

### Tasks
- [x] **Create failing test**: Write a test in `tests/keyframes.test.ts` demonstrating the drop of percentage keyframes.
- [x] **Fix parser**: Update parsing logic to accept percentages in keyframe selectors.
- [x] **Verify**: Run tests and ensure success.

## Phase 52: Spec Compliance Remediation (Round 7)

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 7 audit report.

### Tasks
- [x] **Media Queries: `min-`/`max-` prefixes in boolean contexts**: Reject them in `validateMediaInParens`.
- [x] **Media Queries: Discrete features in range contexts**: Validate against `RANGE_FEATURES` set.
- [x] **Media Queries: `infinite` keyword for resolution**: Allow `infinite` ident for resolution.
- [x] **Media Queries: `<ratio>` validation with math functions**: Refactor to consume entire sequence and enforce structure.
- [x] **CSSOM: `CSSRule` Interface Constants**: Remove modern constants from interface.
- [x] **CSSOM: `setProperty()` Validation**: Check whether passed property name is supported.
- [x] **CSSOM: Shorthand Priority Logic**: Require all mapped longhands to be important.
- [x] **CSSOM: Shorthand Value Logic**: Require all mapped longhands to be present.
- [x] **CSSOM: `replace()` executes Synchronously**: Document or mock parallel execution.
- [x] **Variables: `env()` in `@property`**: Allow `env()` in `isComputationallyIndependent`.
- [x] **Variables: Math Functions in Initial Values**: Enhance `matchesSyntax` to accept `calc()` for dimension/number/percentage.
- [x] **Variables: At-Rule Parsing Crash Risk**: Add explicit null checks for `block` in handlers.
- [x] **Variables: Parse-Time Validation Too Strict**: Remove `var()` syntax checking in `validateCustomPropertyValue`.
- [x] **Variables: Guaranteed-Invalid Value**: Return guaranteed-invalid value on cycle detection.
- [x] **Selectors: Validation for Non-Selector Arguments**: Validate arguments for functional pseudos.
- [x] **Selectors: Specificity Return Type Inconsistency**: Standardize to return array or provide distinct methods.
- [x] **Selectors: Missing `:has-slotted` Pseudo-class**: Add to `PSEUDO_CLASSES` list.
- [x] **Typed OM: `round()` Step-Value Omission Logic**: Strictly adhere to omission rules.
- [x] **Typed OM: Missing `type()` Consistency Checks**: Refactor `type()` to map over children and use `addTypesForSum`.
- [x] **Typed OM: Incorrect Return Types for Trig/Exp Functions**: Update `CSSMathFunction.type()` mapping.
- [x] **Typed OM: `localeCompare` Violates Code Point Order**: Replace with strict string inequality.
- [x] **Syntax: Trailing Whitespace Not Stripped**: Strip trailing whitespace after stripping `!important`.
- [x] **Syntax: Qualified Rule Mistaken for Custom Property**: Add check in main `consumeQualifiedRule`.
- [x] **Syntax: Missing Spec Entry Points**: Implement missing entry points in `Parser`.
- [x] **Logical Properties: `removeProperty` Deletes Unrelated Physical Properties**: Fix `allLh` set in `removeProperty`.
- [x] **Logical Properties: `getPropertyValue` Fails on `logical` Keyword**: Check both `longhands` and `logicalLonghands`.
- [x] **Logical Properties: `getPropertyPriority` Ignores Logical Properties**: Extract tie-breaking logic into helper.
- [x] **Nesting: Missing Feature in `CSSGroupingRule.insertRule()`**: Automatically wrap standalone valid declarations in `CSSNestedDeclarations`.
- [x] **Nesting: Error Recovery Bug in `parser.ts`**: Fix stream reset in `consumeNestedQualifiedRuleFromStream`.
- [x] **Nesting: Specificity Refinement**: Verify in `cascade.ts` to ensure it passes MAX specificity.

## Phase 53: Spec Compliance Remediation (Round 8) [x]

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 8 audit report.

### Tasks
- [x] **Nesting: `&` Selector Specificity**: Replace `&` with `:where(:scope)` when no parent exists.
- [x] **Nesting: Top-Level Grouping Rules**: Enforce `<rule-list>` parsing for top-level grouping rules.
- [x] **Variables: Case-Sensitive Descriptors**: Use `toLowerCase()` for `@property` descriptors.
- [x] **Variables: `CSSPropertyRule.cssText` Serialization**: Use `serializeIdentifier` and remove space.
- [x] **Syntax: Surrogate Pair Preprocessing**: Fix regex in `Tokenizer.preprocess()`.
- [x] **Syntax: `consumeNestedQualifiedRuleFromStream` Remnants**: Consume remnants before returning null.
- [x] **Syntax: `consumeQualifiedRule` Nested Flag**: Respect `nested` flag in `consumeQualifiedRule`.
- [x] **Logical Properties: Hardcoded Mapping**: Return empty string on conflicts in `getPropertyValue`.
- [x] **Logical Properties: Invalid Intervening Checks**: Remove `isOrthogonal` hack.
- [x] **Logical Properties: Unconditional `move-to-end`**: Only move when necessary in `setProperty`.
- [x] **Selectors: Invalid Forgiving Selectors**: Remove ampersand workaround or use invalid-selector type.
- [x] **Selectors: Namespaced Type Selectors**: Enforce type check in `consumeTypeOrUniversalSelector`.
- [x] **Typed OM: Math Function Arity**: Enforce arity in `parseMathFunction`.
- [x] **Typed OM: `round()` Step-Value**: Strictly adhere to omission rules.
- [x] **Typed OM: `mod()` and `rem()` Type Validation**: Enforce same resolved type.
- [x] **CSSOM: `insertRule` `@import` Precedence**: Allow inserting at index 0 if regular rules exist.
- [x] **CSSOM: `deleteMedium` Duplicates**: Remove all occurrences of target medium.
- [x] **CSSOM: `CSSPageDescriptors` Attributes**: Add missing properties to interface.
- [x] **Media Queries: Preserving Unknown Features**: Do not replace with `not all` at parse time.
- [x] **Media Queries: Truth-Value Evaluation removal**: Remove evaluation logic from parse time.
- [x] **Media Queries: Dead Code removal**: Remove `lowercaseIdents` function.

## Phase 54: Spec Compliance Remediation (Round 9) [x]

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 9 audit report.

### Tasks
- [x] **Nesting: `CSSNestedDeclarations` `style` setter**: Implement getter and setter for `PutForwards=cssText`.
- [x] **Nesting: `@scope` relative selector normalization**: Remove call to `normalizeNestedSelector` in `normalizeScopePrelude`.
- [x] **Variables: `@property` side-effects**: Invoke `PropertyRegistry.register()` in `handlePropertyRule`.
- [x] **Variables: `CSSPropertyRule.cssText` serialization**: Use `serializeIdentifier` and remove space.
- [x] **Syntax: Whitespace Trimming in List Parsing**: Remove whitespace trimming in `parseCommaSeparatedListOfComponentValues()`.
- [x] **Syntax: Dead Code in `consumeBlockContents`**: Remove `if (stream.position === pos)` check.
- [x] **Logical Properties: `border-block`/`inline` contraction**: Refactor contraction methods to compose `contractBorderSide`.
- [x] **Logical Properties: `border-radius` combination**: Prevent logical longhands from combining into `border-radius`.
- [x] **Logical Properties: `setProperty` Order Disruption**: Remove `shouldMoveToEnd` logic and update in-place.
- [x] **Selectors: `:not()` Chaining After Pseudo-elements**: Relax constraint to recursively validate arguments.
- [x] **Selectors: Implicit Descendant Combinator in `:has()`**: Prepend descendant combinator to AST.
- [x] **Selectors: Legacy `:-webkit-autofill` Alias**: Implement translation map to `:autofill`.
- [x] **Typed OM: Invalid Parsing of `+infinity`**: Remove custom unary operator checking block.
- [x] **Typed OM: `clamp()` Missing `none` Keyword**: Update to recognize `none` keyword.
- [x] **CSSOM: Missing `length` Getter on `CSSKeyframesRule`**: Implement `get length()` in `CSSOM.ts`.
- [x] **CSSOM: `CSSStyleRule.style` Type Mismatch**: Update type to `CSSStyleProperties`.
- [x] **Media Queries: Incorrect Serialization of `all and ...`**: Update `canonicalSerialize` to omit `all and` when appropriate.
- [x] **Media Queries: Validation of `min-`/`max-` in Boolean Contexts**: Reject them in `validateMediaInParens`.
- [x] **Media Queries: Lack of `<general-enclosed>` Representation**: Refactor to build proper AST.
- [x] **Media Queries: Whitespace inside Compound Operators**: Enforce strict syntax validation.
- [x] **Media Queries: Missing Kleene 3-Valued Logic**: Implement it for error handling.

## Phase 55: Spec Compliance Remediation (Round 10) [x]

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 10 audit report.

### Tasks

- [x] **CSSOM: Missing `[PutForwards=cssText]` Setters**:
  - [x] Add to `CSSPageRule`
  - [x] Add to `CSSMarginRule`
  - [x] Add to `CSSFontFaceRule`
  - [x] Add to `CSSKeyframeRule`
- [x] **CSSOM: Misplaced `cssFloat` Attribute**: Move to `CSSStyleProperties` interface.
- [x] **CSSOM: `CSSRule` Constants**: Align with `cssom-1` or add `SUPPORTS_RULE`.
- [x] **Nesting: `@scope` Rules in Cascade**: Implement `CSSScopeRule` as subclass of `CSSGroupingRule`.
- [x] **Nesting: `CSSNestedDeclarations` without Parent**: Match against `:scope` when `parentSelector` is absent.
- [x] **Nesting: Specificity of Unparented `&`**: Replace with `:where(:scope)` for zero specificity.
- [x] **Nesting: Nested `@scope` Prelude**: Absolutize implied nesting selector in `<scope-start>`.
- [x] **Variables: `@property` Side-Effects**: Call `validate()` during parsing instead of `register()`.
- [x] **Variables: `var()` Fallback on Cycles**: Rearrange logic to use fallback on cyclic dependencies.
- [x] **Variables: Trailing Invalid Arguments in `var()`**: Assert all tokens before comma constitute single identifier.
- [x] **Typed OM: `CSSTranslate` etc. Typings**: Make properties non-optional in type system.
- [x] **Typed OM: `CSSMatrixComponent` Immutability**: Type `matrix` as `DOMMatrix` and add `options` argument.
- [x] **Typed OM: `CSSColorValue` Primitive Ergonomics**: Allow raw numbers and strings in constructors.
- [x] **Syntax: `!important` Extraction Order**: Move extraction logic before `hasCurlyBlock` validation.
- [x] **Syntax: At-Rules on EOF/Close Brace**: Return at-rule instead of `null` when appropriate.
- [x] **Syntax: Precision Loss in Numeric Tokens**: Hold computed number directly in `Token.value`.
- [x] **Media Queries: Preserving Unknown Features**: Do not replace with `not all` at parse time.
- [x] **Media Queries: Truth-Value Evaluation removal**: Remove evaluation logic from parse time.
- [x] **Media Queries: `<general-enclosed>` Fallback**: Fall back to `<general-enclosed>` instead of hard parse error.
- [x] **Media Queries: Range Context Value Validation**: Invoke `matchesType` on operand value.






## Phase 54: External Parser Validation [x]

Objective: Extract test cases from LightningCSS and run them against our parser to analyze compatibility and spec compliance differences without attempting to fix them.

### Tasks
- [x] **Extract Tests**: Extract `test()` and `error_test()` like cases from LightningCSS rust files.
- [x] **Create JSON Fixtures**: Save extracted tests to `tests/fixtures/external/lightningcss.json`.
- [x] **Test Runner**: Create `tests/external-lightning.test.ts` to execute extracted tests against our parser.
- [x] **Analyze Results**: Tally parse successes, mismatches, and `error_test` non-throws.
- [x] **Provide Summary**: Output the summary of failures to the user.

## Phase 56: Developer Experience (DX) Improvements

Objective: Address DX feedback to make the library easier to use for external developers.

### Tasks
- [x] **DX Feedback**: Process and determine resolution for DX feedback in `docs/reports/dx-feedback.md`.

## Phase 57: Spec Compliance Audit Remediation (Round 11)

Objective: Address spec compliance issues, missing features, and technical debt identified in the Round 11 audit report.

### Tasks

#### 1. CSS Logical Properties Level 1
- [x] Fix physical property mapping for corner radii in `vertical-rl` mode.
- [x] Retain logical keys in computed style output in `cascade.ts`.

#### 2. CSSOM Level 1
- [x] Refactor inheritance hierarchy between `CSSStyleDeclaration` and `CSSStyleProperties`.
- [x] Add `[PutForwards=mediaText]` setters for `StyleSheet.media` and `CSSImportRule.media`.
- [x] Implement runtime `StyleSheet` base class.
- [x] Add missing IDL attributes to `CSSPageDescriptors` (margin properties and dashed aliases).

#### 3. CSS Variables & Properties Level 1
- [x] Ensure `@property` rules register properties in `PropertyRegistry`.
- [x] Substitute registered properties as computed values.
- [x] Fix cycle tracking to prevent fallbacks from rescuing cyclic dependencies.

#### 4. CSS Values Level 4 & Typed OM
- [x] Enforce distribution conditions in calculation simplification in `math-parser.ts`.
- [x] Make `CSSNumericArray` fully immutable.
- [x] Apply `readonly` modifiers to IDL-specified readonly properties.
- [x] Rename `CSSOklab`/`CSSOklch` to match spec casing.
- [x] Hide `simplify()` from public interface.
- [x] Implement missing Typed OM types (`CSSUnparsedValue`, `CSSPositionValue`, `CSSTransformValue` and subclasses).

#### 5. CSS Nesting Module Level 1
- [x] Refactor `SelectorParser.ts` to natively accept `<relative-selector-list>`.
- [x] Fix parsing of nested `@scope` prelude (do not use `normalizeNestedSelector`).
- [x] Fix infinite lookahead in `consumeDeclarationFromStream` for curly blocks.

#### 6. Media Queries Level 4
- [x] Implement logic to evaluate unknown features and replace query with `not all`.
- [x] Refactor `MediaParser` to build AST and serialize from it.
- [x] Enforce grammar in `parseMediaConditionWithoutOr` by rejecting trailing `and`s.

#### 7. CSS Syntax Level 3
- [x] Introduce generic pass in `setProperty` to reject values with `bad-string` or `bad-url`.

## Phase 58: Unified Local Units Configuration & Codegen

Objective: Centralize CSS unit definitions in a single configuration file with specification references, and generate unit-related code/types to keep them in sync.

### Tasks
- [ ] **Define Unified Units Config**: Create a local configuration file (e.g., `the src/data/units.json`) containing all supported CSS units.
- [ ] **Cross-Reference Specifications**: Ensure the units configuration file contains gratuitous links to W3C specification URLs for every unit type.
- [ ] **Implement Units Codegen**: Update `scripts/codegen/generate_units_code.ts` to parse the new configuration file and generate TypeScript types (`CSSUnit` in `src/typed-om.ts`) and conversion mappings (`the src/units.ts`).
- [ ] **Integrate and Verify**: Add the generator to `scripts/generate_all.ts` and verify with `pnpm run preflight`.

## Phase 59: Preparing for Release & OSPO Compliance [x]

Objective: Prepare the repository for public open-source release by resolving OSPO compliance issues identified by the `cross` linter.

### Tasks
- [x] **Run Compliance Scan**: Use OSPO `cross` linter to scan the repository for compliance issues.
- [x] **Establish License Header Standard**: Determine the shortest acceptable license header format (SPDX Apache-2.0).
- [x] **Apply License Headers**: Prepend SPDX Apache-2.0 license headers to all tracked source files (`.ts`, `.js`, `.yaml`, `.yml`).
- [x] **Pristine LICENSE File**: Restore the exact standard Apache 2.0 license text to the `LICENSE` file to resolve format warnings.
- [x] **Verify Compliance**: Run the `cross` linter again to verify that there are no remaining blockers.

## Phase 60: Repository Cleanups & Gerrit Upload [x]

Objective: Clean up repository structure, remove developer-specific files/paths, and upload to Gerrit for review.

### Tasks
- [x] **Move Markdown Reports**: Reorganize compatibility, hardcoded lists, and spec compliance reports into `docs/reports/`.
- [x] **Ignore Gemini Metadata**: Untrack `.gemini/` files and ensure they are gitignored.
- [x] **De-personalize package.json**: Make the `publish:local` script generic to remove hardcoded user directory paths.
- [x] **Upload to Gerrit**: Squash-merge history and push to Gerrit staging branch as a single clean CL.

## Phase 61: CSS Typed OM Spec Compliance & Polyfill Compatibility [x]

Objective: Align the Typed OM implementation with the specification and resolve gaps exposed by the compatibility run against the polyfill's unit tests.

### Tasks

#### 1. Constructors & API Alignment [x]
- [x] **CSSScale constructor**: Wrap double/number arguments in `CSSUnitValue(val, 'number')` instead of storing raw numbers.
- [x] **CSSTranslate unit validation**: Validate that constructor arguments are of compatible types (length or percentage) and throw `TypeError` if they are not (e.g. angle units).
- [x] **CSSRotate.toMatrix()**: Implement the `toMatrix()` method.
- [x] **CSSUnparsedValue index validation**: Implement proxy or index checks to throw `RangeError` on out-of-bounds index writes.


#### 2. Parser Integration [x]
- [x] **CSSTransformValue.parse integration**: Wire `CSSTransformValue.parse` into the main `CSSStyleValue.parse` flow so that transform functions (like `rotate()`) return structured `CSSTransformValue` objects instead of base `CSSStyleValue` strings.


#### 3. Color Parsing Expansion [x]
- [x] **Extended Color Parsing**: Expand `reifyColor` and `CSSColorValue.parse` to support hex colors, named colors, and all color functions (`hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()`).


#### 4. Semantic Value Validation [x]
- [x] **Validate standard property values**: Prevent `StylePropertyMap.set` and `CSSStyleValue.parse` from accepting invalid values for standard properties. Integrate lightweight grammar checking or parser-based validation.


## Phase 62: Spec Compliance Refinements & Math Wrappers [x]

Objective: Fix remaining compatibility gaps identified during the polyfill test suite run, focusing on math simplification wrappers, mock fallback environments, and CSSRotate validation.

### Tasks

#### 1. DOMMatrixReadOnly Mock Fallback [x]
- [x] **DOMMatrix Fallback**: Fall back to `globalThis.DOMMatrix` inside `newDOMMatrixReadOnly` if `DOMMatrixReadOnly` is not defined in the environment.

#### 2. Rotate Axis Validation [x]
- [x] **Axis Type Checks**: Restrict `CSSRotate` 3D coordinates `x`, `y`, and `z` to be unitless number types (throwing `TypeError` if they have other units).

#### 3. Math Simplification Wrapper Compliance [x]
- [x] **Retain Math wrapper**: Ensure that when `CSSNumericValue.parse` parses a math function (like `calc()`), it retains a single-child `CSSMathSum` wrap even if it simplifies to a single canonical unit (so that it behaves as a `CSSMathValue` and serializes as `calc(...)`).


## Phase 63: Unskipping WPT Tests & Environment Setup [x]

Objective: Address remaining mock setup differences and unskip all WPT tests currently in `knownSkips` inside `the tests/typed-om-wpt.test.ts`.

### Tasks

#### 1. Global CSS Environment Setup [x]
- [x] **Vitest Global Mock Setup**: Create a `vitest.setup.ts` to assign `globalThis.CSS = CSS` and integrate it into the Vitest config `vitest.cssomnom.config.ts`.

#### 2. Call `simplify` on parser values [x]
- [x] **Flatten nested sum values**: Invoke `simplify` on parsed math nodes in `createCSSStyleValue` and `parseNumeric` in `src/typed-om.ts` to support N-ary flat sums.

#### 3. Unskip Skipped Tests [x]
- [x] **Transform / Keyword setter reactivity**: Add manual setup blocks in `the tests/typed-om-wpt.test.ts` for skipped `"result"` tests (transform `is2D` mutation, keyword/unit value setter mutations).
- [x] **Unskip all**: Remove all 8 entries from `knownSkips` and verify they pass.


## Phase 64: Test Suite Integrity Hardening [x]

Objective: Fix test integrity concerns, stop silencing regressions, and activate dormant fixtures.

### Tasks

#### 1. Harden LightningCSS Runner [x]
- [x] **Assert failures**: Update `tests/external-lightning.test.ts` to throw assertion errors (failing the test suite) when outputs mismatch, rather than silently catching them.
- [x] **Track skips explicitly**: Move the 1,122 failing cases to an explicit skip/known-fail dictionary to establish a baseline, ensuring any new regressions fail the build.

#### 2. Execute Dormant Fixtures [x]
- [x] **Nesting parsing**: Write a test runner `tests/wpt-nesting.test.ts` to run Nesting tests in `tests/fixtures/wpt/wpt-nesting.json`.
- [x] **Selector serialization**: Write a test runner `tests/wpt-selectors.test.ts` to run selector serialization tests in `tests/fixtures/selectors.json`.
- [x] **Value serialization**: Load and run the remaining dormant fixtures (`tests/fixtures/wpt/wpt-cssom.json`).

#### 3. Houdini Custom Properties Validation [x]
- [x] **Unskip custom properties**: Implemented dedicated WPT conformance validator runner `tests/wpt-properties-values.test.ts` executing all 2,000+ at-rule and JS validation cases.

---

## Phase 65: Test Runner Bug Fixes & Strict Assertions [x]

Objective: Fix critical assertion-swallowing and skip-masking bugs in the newly created and modified test runners.

### Tasks

#### 1. Fix WPT Selector Test Swallowing [x]
- [x] **Fix assertion catching**: Refactor `tests/wpt-selectors.test.ts` to separate the `assert.fail()` call from the main `try/catch` block, ensuring that failed assertions are correctly raised and reported.

#### 2. Implement Native Skips in WPT Extracted [x]
- [x] **Native test skips**: Replace the `return` and catch-silencing blocks in `tests/wpt-cssom.test.ts` with Node's native `{ skip: isKnownFailure }` option, ensuring the test reporter displays true test coverage and skips.

#### 3. Refine Expected Error Assertions [x]
- [x] **Assert error types**: Update `tests/wpt-properties-values.test.ts`, `tests/external-lightning.test.ts`, and `the tests/typed-om-wpt.test.ts` to verify that thrown errors are valid spec exceptions (like `TypeError` or `SyntaxError` / `DOMException`) instead of silently allowing runtime crashes.

#### 4. Harden AST Selector Sequencing [x]
- [x] **Enforce invalid selector failures**: Update `tests/selectors-sequencing.test.ts` to strictly assert that invalid compound selectors return `null` or throw errors.

---

## Phase 65.5: Clean Up Remaining Test Swallows & Skips [x]

Objective: Fix residual test integrity issues discovered in the third audit pass, including sequencing assertion swallowing, WPT early returns, and register-property try-catches.

### Tasks

#### 1. Fix `selectors-sequencing.test.ts` Swallowing [x]
- [x] **Remove helper try-catch**: Refactor `assertSelectorRejected` in `tests/selectors-sequencing.test.ts` to remove the try-catch block, letting assertion failures bubble up to fail the test.

#### 2. Replace Early Returns in `the tests/typed-om-wpt.test.ts` with `t.skip()` [x]
- [x] **Native skips for manual results**: Update `the tests/typed-om-wpt.test.ts` to call context-level `t.skip()` (or equivalent) in the `result` handler, rather than returning early and generating a false green pass.

#### 3. Refactor Brittle Try-Catches to `assert.throws` [x]
- [x] **Register-property assertions**: Convert try-catch blocks in `tests/register-property.test.ts` and `tests/external-csstree-errors.test.ts` to standard `assert.throws` matching explicit `DOMException` / `SyntaxError` attributes.

---

## Phase 66: Dynamic WPT Sandbox Runner [x]

Objective: Build a Node-based VM sandbox runner using `linkedom` to execute browser-based WPT tests without extraction.

### Tasks


#### 1. Implement WPT Sandbox Polyfills [x]
- [x] **Linkedom stylesheet patches**: Patch `HTMLStyleElement.prototype.sheet` in `linkedom` to support standard parsing and `insertRule()`.
- [x] **HTMLElement attributeStyleMap**: Define `HTMLElement.prototype.attributeStyleMap` and `Element.prototype.computedStyleMap()` getters using our `StylePropertyMap` wrapper.

#### 2. Sandbox VM Execution Script [x]
- [x] **Runner script**: Create `scripts/run_wpt_sandbox.ts` to crawl selected WPT subfolders (like `css-typed-om/` and `css-properties-values-api/`), execute their internal script tags inside a `vm` context, mock `testharness.js` functions, and collect test results.
- [x] **Sandbox configuration**: Support a config file (`tests/wpt-sandbox-config.json`) defining allowlisted/skipped suites and baseline failures.

#### 3. Integrate into Preflight [x]
- [x] **Preflight hook**: Hook `scripts/run_wpt_sandbox.ts` into our node test run to enforce dynamic browser WPT checks.

---

## Phase 65.6: Identify & Prune Obsolete Skips [x]

Objective: Build a diagnostic utility script to detect which of our 1,300+ skipped or baselined tests are now passing, and prune them from our skip records to promote them to active tests.

### Tasks

#### 1. Implement Skip Verification Script [x]
- [x] **Verification script**: Create a script `scripts/prune_resolved_failures.ts` that loads all test runners, bypasses their skip lists, executes the tests, and reports which ones are now passing.
- [x] **Baseline pruner**: Support a write-back flag or step in the script to automatically remove passing cases from `lightning-known-failures.json` and `wpt-cssom-known-failures.json`.

#### 2. Run and Prune Obsolete Skips [x]
- [x] **Identify and Prune**: Run `node scripts/prune_resolved_failures.ts` and verify which tests are passing. Prune the passing tests from all lists.
- [x] **Preflight check**: Confirm that our preflight still passes and the newly unskipped tests are verified correctly.



---

## Phase 68: Consolidated Spec Compliance Audits [x]

Objective: Implement the findings from our consolidated spec compliance report across Typed OM, CSSOM, Syntax, Nesting, logical, colors, and animations.

### Tasks

#### 1. Numeric Values & Typed OM [x]
- [x] **to() SyntaxError**: Throw a SyntaxError instead of a TypeError for invalid units.
- [x] **Trig unitless radians**: Let `sin()`, `cos()`, `tan()` simplify unitless numbers directly as radians.
- [x] **Standard math function calculation**: Implement simplification for `atan2`, `mod`, `rem`, `exp`, and `log` in `simplify()`.
- [x] **hypot() compatible units**: Canonicalize compatible units before resolving hypotenuse.
- [x] **min()/max() single child**: Update `CSSMathMin`/`CSSMathMax` to fully simplify same-unit children to a single child.
- [x] **sortSumChildren order**: Correct sorting order to Numbers -> Percentages -> Dimensions.
- [x] **Zero-valued power keys**: Delete power `0` keys in `CSSNumericType`.
- [x] **Invert percentHint**: Preserve `percentHint` in `CSSMathInvert.type()`.
- [x] **addTypes multiplication**: Refactor `addTypes` for multiplication to apply the percent hint propagation.
- [x] **CSSMathClamp type**: Resolve combined type of all three clamp arguments.
- [x] **CSSMathRound validation**: Add type compatibility checks in constructor and resolve combined types in `type()`.

#### 2. CSS Logical Properties [x]
- [x] **text-orientation upright**: Support `text-orientation: upright` direction override to `ltr` in vertical modes in cascade resolution.
- [x] **Cascade inheritance**: Support looking up parent writing-mode/direction resolved values in `getCascadedStyle`.
- [x] **Logical corner shorthands**: Expand and contract logical border corner radius shorthands.

#### 3. Media Queries [x]
- [x] **Comma list empty query recovery**: Empty queries in comma lists must resolve to `not all`.
- [x] **aspect-ratio single operand**: Serialize `<ratio>` with both components even if denominator defaults to 1 (e.g. `2 / 1`).
- [x] **aspect-ratio / spaces**: Ensure `/` in ratios has spaces around it during serialization (e.g. `1 / 3`).
- [x] **Resolution unit x**: Convert `x` unit to `dppx` during Sum Value creation.

#### 4. CSSOM [x]
- [x] **CSSPageRule selectorText**: Convert to getter/setter with syntax validation and serialization normalization.
- [x] **CSSImportRule styleSheet doc**: Document `CSSImportRule.styleSheet` returning `null` in `API_BOUNDARIES.md`.
- [x] **CSSKeyframesRule methods**: Implement `appendRule`, `deleteRule`, and `findRule`.
- [x] **Missing rules**: Add stub classes for `CSSCounterStyleRule` and `CSSFontFeatureValuesRule`.
#### 5. Selectors & Specificity [x]
- [x] **Undeclared namespace prefixes**: Throw SyntaxError on undeclared namespace prefixes.
- [x] **pseudo-element combination**: Allow `:is()` and `:where()` to follow pseudo-elements.
- [x] **CSSStyleRule selectorText**: Getter must serialize AST dynamically; Setter must not change values if parsing fails.

#### 6. CSS Syntax [x]
- [x] **EOF in escape sequence**: Report parse error when EOF is reached during escape sequence consumption.
- [x] **At-rule EOF prelude**: Do not report parse error when at-rule prelude is terminated by EOF.
- [x] **Declaration block flushing**: Distinguish "nothing returned" from "invalid rule error" to avoid splitting contiguous nested declarations.

#### 7. CSS Animations [x]
- [x] **@keyframes name validation**: Reject disallowed custom-idents (`none`, `initial` etc.) and empty strings.
- [x] **Percentage range checks**: Ensure keyframe selector percentages are strictly in `[0, 100]` range.
- [x] **Selector keyword normalization**: Normalize `from` and `to` to `0%` and `100%`.
- [x] **keyText setter**: Throw SyntaxError on invalid selectors.
- [x] **CSSKeyframesRule index accessors**: Support indexing (`rule[0]`) on `CSSKeyframesRule`.
- [x] **Disallowed keyword name serialization**: Serialize disallowed names as strings.

#### 8. CSS Nesting [x]
- [x] **Relative nested selector**: absolutize relative selectors in nested style rule `selectorText` setters.
- [x] **@scope resetting parent**: Reset parent selector context to `:where(:scope)` inside `@scope`.

#### 9. Custom Properties [x]
- [x] **CSS.registerProperty name**: Throw TypeError if name is omitted.
- [x] **Specified value reification**: Custom properties (both registered and unregistered) must always reify to `CSSUnparsedValue` for specified values.

#### 10. CSS Colors [x]
- [x] **Subclass WebIDL casing**: Rename subclasses to `CSSLCH`, `CSSOKLab`, and `CSSOKLCH`.
- [x] **CSSColorValue validation**: Make color components validated getters/setters.
- [x] **Default alpha**: Default alpha parameters to primitive `1` to trigger percent rectification.
- [x] **Lab/Oklab percentage conversion**: Convert percentage inputs to numbers during parsing.
- [x] **System colors**: Resolve system color keywords to `CSSKeywordValue`.

---

## Phase 69: Spec Compliance Audit Remediation (Round 11) [x]

Objective: Address and implement the 8 verified findings identified during the Round 11 Spec Compliance Audit.

### Tasks

#### 1. CSS Typed OM, Math Simplification, and Custom Properties
- [x] **clamp() simplification**: return computed value instead of `CSSMathClamp` when all bounds and value are compatible resolved `CSSUnitValue`s.
- [x] **CSSMathProduct dimensional division**: simplify product tree holding `CSSMathInvert` nodes if the result is a valid CSS dimension.
- [x] **CSS-wide keywords in Custom Properties**: skip `matchesSyntax` check if resolved custom property value matches any CSS-wide keyword.

#### 2. CSS Logical Properties, Selectors, Nesting, and Colors
- [x] **rectifyColorAngle Error Type**: throw standard `TypeError` instead of `SyntaxError` DOMException on invalid angles.
- [x] **color() function support**: implement `color()` function reification to `CSSColor`.
- [x] **Pseudo-elements sequence validation**: relax compound selector sequencing to allow any pseudo-class or pseudo-element after `::part()` or `::slotted()`.

#### 3. CSSOM and CSS Syntax
- [x] **Transform Components Setters & Types**: use getter/setter pairs with `ensureNumeric` and corresponding unit validations in `CSSScale`, `CSSSkew`, `CSSSkewX`, `CSSSkewY`, and `CSSPerspective`.
- [x] **Number/Percentage/Dimension Serialization Formatting**: implement `formatNumber` utility (up to 6 decimals, no scientific notation) and use it for token serialization and `CSSUnitValue.toString()`.


---

## Phase 61: SelectorParser Quality Improvements [x]

Objective: Improve types cleanliness and readability of `src/SelectorParser.ts`.

### Tasks
- [x] **Clean up pseudo sets typings**: Modify codegen script to export `Set<string>` instead of literal types.
- [x] **SelectorParser options**: Accept `SelectorParserOptions` object instead of telescoping positional flags.
- [x] **Update instantiations**: Update all call sites of `new SelectorParser(...)` to use options.
- [x] **Guards & Cursor**: Implement type-safe type guards and a `ComponentValueCursor` iterator.
- [x] **Logic cleanup**: Clean up attribute, type/universal, compound selector parsing using the cursor and guards.

---

## Phase 62: Clean Polyfill Compatibility Setup [x]

Objective: Isolate the polyfill compatibility test setup to keep submodules clean.

### Tasks
- [x] **Move vitest config**: Create `tests/polyfill-compat/vitest.config.ts` and `vitest.setup.ts` in our repo to avoid untracked files in the submodule.
- [x] **Restore submodules**: Revert all local changes in the `css-typed-om-polyfill` submodule to keep it pristine.
- [x] **Natively implement spec-compliant serialization**: Implement `CSSRGB.toString` legacy comma-separated serialization (CSS Color 4 #css-serialization-of-srgb) and division-by-zero math serialization in `src/typed-om.ts`, avoiding mock patches in the setup file.
- [x] **Fix CSSColor alpha**: Fix `CSSColor.alpha` setter in `src/typed-om.ts` to allow numbers without forcing them to percentages (resolving `color()` test failure).
- [x] **Resolve tests dynamically**: Use `fs.readdirSync` in config to resolve all tests, excluding `clamp.test.ts` due to expected spec-compliance simplification differences.
- [x] **Parser compatibility wrapper**: Implement `tests/polyfill-compat/parser-compat.ts` to map polyfill parser tests to our `CSSStyleValue.parse` and tokenizer, avoiding running the polyfill's own parser.
- [x] **DOM Prototype Patching**: Implement `attributeStyleMap` and `computedStyleMap` mock patching on DOM prototypes in the setup file.
- [x] **Shorthand fallback and stubbing**: Fix `CSSStyleDeclaration.getPropertyValue` and `removeProperty` to fall back to direct declarations when shorthand contraction/expansion is not supported or fails, and support marking stubs in `SHORTHANDS`.

## Phase 63: WPT Shim and Test Harness Refactor [x]

Objective: Run WPT tests dynamically using a lightweight harness shim, eliminating static JSON fixtures.

### Tasks
- [x] **WPT Harness Shim**: Refactor `the tests/typed-om-wpt.test.ts` to execute WPT HTML files directly using Node's `vm` module, injecting a lightweight `testharness.js` shim (supporting `test()`, `assert_equals()`, and `assert_style_value_equals()`).
- [x] **Convert Custom Tests**: Port the custom tests from `the tests/fixtures/typed-om-custom.json` into a native TS unit test file `tests/typed-om-custom-serialization.test.ts`.
- [x] **Clean Up Static Fixtures**: Delete the static JSON fixtures (`the tests/fixtures/typed-om.json` and any custom/extracted JSONs) and the temp script `the scripts/fixtures/extract_typed_om.ts`.
- [x] **Verify preflight**: Run `pnpm run preflight` to ensure everything passes with the new dynamic runner.

---

## Phase 64: Unify WPT Sandbox and Test Shims [x]

Objective: Merge redundant WPT shims and DOM setups into a single, clean helper file (`tests/wpt-shim.ts`) and reuse it across both Node unit tests and the sandbox CLI script.

### Tasks
- [x] **Consolidate shims**: Move any unique shims from `scripts/run_wpt_sandbox.ts` (such as `promise_test()`, `assert_not_equals()`, `assert_array_equals()`, `assert_class_string()`, `assert_unreached()`) into `tests/wpt-shim.ts`.
- [x] **Consolidate DOM setups**: Integrate the `HTMLStyleElement` `.sheet` mock patching from `the tests/wpt-sandbox-setup.ts` and the `ComputedStylePropertyMapReadOnly` class from it into `tests/wpt-shim.ts`.
- [x] **Cleanup setup files**: Delete `the tests/wpt-global-setup.ts` and `the tests/wpt-sandbox-setup.ts` and update any imports.
- [x] **Refactor `scripts/run_wpt_sandbox.ts`**: Make `run_wpt_sandbox.ts` use the unified shims and prototype patches from `tests/wpt-shim.ts`.
- [x] **Verify preflight**: Run `pnpm run preflight` to confirm both test suites and the CLI script compile and pass.

---

## Phase 65: Generate Standard Properties Syntax List [x]

Objective: Replace the manually authored `the src/data/standard-properties-syntax.ts` with a machine-generated file generated from `@webref/css` or `mdn-data` to follow codebase guidelines and support easier expansion of CSS property validation.

*Note: We built the generator but reverted it. Standard CSS property grammars use complex structures (like spaces, groupings, `||`, `&&`) that are incompatible with Houdini `parseSyntax` constraints. We decided to manually maintain and document the file instead to avoid runtime SyntaxErrors and false-positive TypeErrors.*

### Tasks
- [x] **Create Generator**: Reverted (reasons documented in `the src/data/standard-properties-syntax.ts`).
- [x] **Hook into generate_all**: Reverted.
- [x] **Verify preflight**: Hand-authored version with comprehensive documentation passes preflight.
- [x] **Move STANDARD_PROPERTIES_SYNTAX**: Relocated from external `the src/data/standard-properties-syntax.ts` to private constant in `src/typed-om.ts` to avoid circular dependencies and API leak.

---

## Phase 66: WPT Sandbox Config Compactness Optimization [x]

Objective: Eliminate the verbose 9.5k line static JSON baseline configuration file and replace it with a dynamically-crawled test runner and compact serialized format.

### Tasks
- [x] **Dynamic WPT crawling**: Update `tests/wpt-sandbox.test.ts` to crawl the `css-typed-om` directory dynamically at runtime instead of loading a static `include` array.
- [x] **Compact JSON Formatting**: Implement custom single-line-array serialization in `scripts/update_wpt_baseline.ts` to store each file's failures on a single line.
- [x] **Dynamic exclusion**: Identify files that fail to initialize (syntax/load errors) and automatically populate them into the `exclude` list during baseline runs.
- [x] **Verify preflight**: Run `pnpm run preflight` to confirm all 358 WPT test files run successfully in 9 seconds with the new compact JSON format (~335 lines).

---

## Phase 67: Syntax Validation Expansion for Keyword and Simple Properties [x]

Objective: Manually expand syntax validation in `src/typed-om.ts` by adding simple keyword-only or basic single-unit properties to the `STANDARD_PROPERTIES_SYNTAX` registry. This will resolve thousands of WPT failures expecting `TypeError` on invalid value sets, without violating Houdini `parseSyntax` constraints.

### Tasks
- [x] **Identify Candidate Properties**: Analyze the WPT failures in `tests/fixtures/baselines/wpt-sandbox-known-failures.json` to find properties that fail because they allow invalid types (e.g. `writing-mode`, `direction`, `pointer-events`, `unicode-bidi`, `display`, `position`, etc.).
- [x] **Define Houdini-Compliant Syntaxes**: Add these properties to `STANDARD_PROPERTIES_SYNTAX` inside `src/typed-om.ts`. Ensure their syntax strings use only basic types, `|` alternatives, or basic multipliers (no space separators, groupings, `||`, or `&&`).
- [x] **Verify and Baseline**: Run `node scripts/update_wpt_baseline.ts` to execute the suite and confirm the resolved test cases are automatically removed from `tests/fixtures/baselines/wpt-sandbox-known-failures.json`.
- [x] **Address Code Review Findings**:
  - [x] Remove complex/space-separated properties that cause false-positives from `STANDARD_PROPERTIES_SYNTAX` (`display`, `font-style`, `font-variant-ligatures`, `font-variant-numeric`, `font-variant-east-asian`, `grid-auto-flow`, `text-overflow`, `text-emphasis-position`, `text-underline-position`, `list-style-type`, `overflow-clip-margin`).
  - [x] Correct `transform-style` syntax by removing the invalid `auto` keyword.
  - [x] Tweak documentation comments above `STANDARD_PROPERTIES_SYNTAX` to describe Houdini limitations and the baseline script.
  - [x] Expand `tests/typed-om-validation.test.ts` to cover `<length-percentage>` (e.g. `bottom`) and `<length>`-only (e.g. `outline-offset`) error-throwing boundaries.
- [x] **Run Preflight & Update Baseline**: Re-run the update baseline script and verify that `pnpm run preflight` is green.

---

## Phase 68: Pruning External Test Baselines to Collapsed Single-Line Keys [x]

Objective: Migrate the massive, duplicate-heavy external test baselines (`lightning-known-failures.json` and `wpt-cssom-known-failures.json`) to a flat list of human-readable, collapsed single-line keys to reduce file sizes and clean up git diffs.

### Tasks
- [x] **Define Unified Normalizer**: Extract or share the whitespace normalizer logic.
- [x] **Refactor Test Runners**: Update `tests/external-lightning.test.ts` and `tests/wpt-cssom.test.ts` to perform checks against Sets populated with the collapsed string keys.
- [x] **Refactor Baseline Maintenance Scripts**: Update `scripts/prune_resolved_failures.ts` and `scripts/generate_lightning_baseline.ts` to read/write collapsed string array baselines.
- [x] **Regenerate Baselines**: Execute the baseline updates and confirm the new compact baselines are generated and all tests remain green.

---

## Phase 69: CSSPositionValue, var() Normalization, and CSSTransformValue/DOMMatrix [x]

Objective: Implement missing CSS Typed OM classes (`CSSPositionValue`, `CSSTransformValue`, transform components), support reification to/from `DOMMatrix`, and clean up `var()` reference normalization to align with WPT requirements.

### Tasks
- [x] **Fix Reification and Routing Logic in StylePropertyMap**:
  - [x] Revert `CSSStyleValue.parseAll` wrapping for `translate`, `rotate`, and `scale` so they return raw `CSSTranslate`, `CSSRotate`, and `CSSScale` directly.
  - [x] Refactor `StylePropertyMapReadOnly.get` and `getAll` to serialize declaration values and parse them using `CSSStyleValue.parseAll` (fixing incorrect `CSSUnparsedValue` fallback).
  - [x] Refactor `StylePropertyMap.get` and `getAll` to parse values using `CSSStyleValue.parseAll` (fixing incorrect `CSSUnparsedValue` fallback).
  - [x] Resolve WPT sandbox math/validation failures:
    - [x] Throw `SyntaxError` on division by zero during math simplification.
    - [x] Validate parsed numeric values in `CSSNumericValue.parse` to reject unresolved Level 4 functions (like `sign()`).
    - [x] Enforce empty values validation in `StylePropertyMap.set`/`append` to throw `TypeError`.
    - [x] Exclude `attribute-changed-callback.html` due to missing `customElements` in sandbox.
- [x] **CSSPositionValue**:
  - [x] Implement `CSSPositionValue` class in `src/typed-om.ts` with constructor `(x, y)` and properties `.x` / `.y` validating to `<length-percentage>`.
  - [x] Hook `CSSPositionValue` parsing and reification for position-allowing properties (like `background-position`, `object-position`).
  - [x] Add unit tests in `tests/typed-om-position.test.ts`.
- [x] **var() Reference Normalization**:
  - [x] Validate reification of custom property variables and fallback values to `CSSVariableReferenceValue`.
  - [x] Normalize fallback values to ensure spec compliance when parsed.
- [x] **CSSTransformValue & DOMMatrix**:
  - [x] Expose or implement a basic compliant `DOMMatrix` helper.
  - [x] Implement `CSSTransformValue` class containing a list of `CSSTransformComponent` subclasses (`CSSTranslate`, `CSSRotate`, `CSSScale`, `CSSSkew`, etc.).
  - [x] Implement `.toMatrix()` on transform components.
  - [x] Add unit tests in `tests/typed-om-transforms.test.ts`.
  - [x] Address DOMMatrix & DOMMatrixReadOnly code review findings:
    - [x] Write failing regression tests (Red phase)
    - [x] Fix matrix multiplication (post-multiplication & multiplyArrays A * B)
    - [x] Fix column-major array export/import (transpose for toFloat/fromFloat, length check, and parseMatrixInit)
    - [x] Fix string parser updates (handle 'none' and "" as 2D identity matrix)
    - [x] Verify tests pass and run preflight

---

## Phase 70: WPT Progress Tracking & Automation [x]

Objective: Automate conformance logging of WPT sandbox tests to track progress over time.

### Tasks
- [x] **Progress Tracking Script**: Create `scripts/update_wpt_progress.ts` to execute WPT sandbox tests and append current statistics to `wpt-typed-om-progress.md` only when they change.
- [x] **Git Pre-commit Hook**: Implement `.git/hooks/pre-commit` to automatically run progress tracking and stage the updated log file when `src/typed-om.ts` changes.
- [x] **Initialize Log**: Run the script and commit the initial baseline log (`5890/12150` passed, 48.48% pass rate).
- [x] **Historical Backfill**: Backfill the progress log table with past test execution numbers from transcripts.

---

## Phase 71: Dedicated Linkedom Integration Tests [x]

Objective: Establish a comprehensive test suite specifically verifying our DOM prototype overrides under Linkedom, verifying scenarios that fail with legacy CSSOM but succeed with CSSOMNom.

### Tasks
- [x] **Create Test Suite (`tests/linkedom.test.ts`)**:
  - [x] Test `Element.prototype.attributeStyleMap` and `computedStyleMap()` reification correctness.
  - [x] Test custom properties case-preservation (workaround verify).
  - [x] Test `HTMLStyleElement.prototype.sheet` dynamic re-parsing upon mutating `textContent`.
  - [x] Test Level 4 value/math reification and serialization in sheets.
- [x] **Code Review & Verification**:
  - [x] Audit changes using the Sequential Quality Loop (`codex_reviewer_cmd`).
  - [x] Verify `pnpm run preflight` is green and commit.

## Phase 72: High-Scrutiny Typed OM Spec Compliance Audit [/]

Objective: Review and resolve compliance gaps in CSS Typed OM Level 1 validated by the Scrutineer.

### Tasks

#### Phase 72.1: Property Map & Parsing Compliance [x]
- [x] Implement `[[associatedProperty]]` internal slot on `CSSStyleValue` to restrict direct instances.
- [x] Implement `iterable` and `size` support on `StylePropertyMapReadOnly`.
- [x] Enforce `[[associatedProperty]]` validation in `StylePropertyMap` write methods.
- [x] Validate property names in `CSSStyleValue.parse`/`parseAll` against `SUPPORTED_PROPERTIES`.
- [x] Reject `CSSUnparsedValue` and `CSSVariableReferenceValue` arguments in `StylePropertyMap.append()`.
- [x] Reify unrepresentable or invalid syntax values to direct `CSSStyleValue` instead of `CSSUnparsedValue`.
- [x] Change `CSSStyleRule.styleMap` type to a read-write `StylePropertyMap`.
- [x] Return `undefined` instead of `null` for missing properties in `StylePropertyMapReadOnly.get()`.
- [x] Reify unitless `0` to `"px"` in length/dimension contexts.

#### Phase 72.2: Math & Numeric Types Conformance [x]
- [x] Fix `addTypesForSum` percent hint resolution to loop over all base types.
- [x] Prevent `CSS.rad` and `CSS.turn` factories from converting inputs to degrees.
- [x] Preserve mathematical AST structure in `CSSNumericValue.parse()` by removing eager simplification.
- [x] Validate unit arguments in the `CSSUnitValue` constructor.
- [x] Validate argument lengths in math value constructors (Sum, Product, Min, Max).
- [x] Validate argument types in the `CSSMathProduct` constructor.
- [x] Support `CSSMathRound` and `CSSMathFunction` in `CSSNumericValue.equals()`.
- [x] Correct casing of unit factories on the `CSS` object (`Hz`, `kHz`, `Q` instead of `hz`, `khz`, `q`).

#### Phase 72.3: Specialty Values & Color Validation [x]
- [x] Assert `CSSTransformValue` constructor throws on empty lists.
- [x] Assert `CSSKeywordValue` constructor throws on empty values.
- [x] Clone input matrices in the `CSSMatrixComponent` constructor.
- [x] Serialize 2D `CSSScale` with equal axes as `scale(x)`.
- [x] Throw `SyntaxError` instead of `TypeError` on color syntax errors.
- [x] Support `ObservableArray` behavior (or prevent direct re-assignment) for `CSSColor.channels`.
- [x] Omit alpha from modern colors serialization when unity.

#### Phase 72.4: DOMMatrix IDL Conformance [x]
- [x] Implement missing standard `DOMMatrix` methods (`flipX`, `flipY`, `rotateFromVector`, `rotateFromVectorSelf`, `scale3d`, `scale3dSelf`, `toJSON`, `transformPoint`, and `setMatrixValue` on `DOMMatrix` / `DOMMatrixReadOnly`).

---

## Phase 73: Shorthand Completeness (background) [x]

Objective: Implement full spec-compliant expansion and contraction for the `background` shorthand.

### Tasks
- [x] **Implement `expand` for `background`**:
  - [x] Implement multi-layered parsing by splitting tokens by top-level commas.
  - [x] Implement `/` size-position delimiter parsing.
  - [x] Parse repeat, attachment, box (origin & clip), image, and position values per layer.
  - [x] Enforce color restriction (only allowed in final layer).
  - [x] Map box keywords according to origin & clip mapping rules (Level 3/4).
  - [x] Build longhand expansion lists and return.
- [x] **Implement `contract` for `background`**:
  - [x] Match layers across all 7 list properties.
  - [x] Serialize position and size with `/` delimiters when needed.
  - [x] Canonicalize repeat, attachment, and box keyword serializations.
  - [x] Add color to final layer and join layers with commas.
- [x] **Tests and Verification**:
  - [x] Write integration unit tests in `tests/style-property-map.test.ts` or `tests/shorthands.test.ts` verifying all test scenarios (single color, multiple gradients, position/size delimiters, box keyword pairings, and Level 4 clip keywords).
  - [x] Verify `pnpm run preflight` is green.
- [x] **Code Review & Verification**:
  - [x] Run Codex Reviewer over the implementation diff range.
  - [x] Run Grizz gatekeeper green check.

## Phase 74: WPT Self-Tests & Conformance Crawler Expansion [/]

Objective: Verify our WPT shim conformance against WPT's own unit tests, then scale up our sandbox runner to crawl and report conformance across all major CSS specification test folders.

### Tasks
- [ ] **WPT `testharness.js` Unit Tests**:
  - [x] Execute the 33 unit tests in `submodules/web-platform-tests/resources/test/tests/unit/` using the WPT sandbox.
  - [x] Identify and fix shim errors, DOM overrides, or compatibility gaps in `tests/wpt-shim.ts` (e.g. sync execution, complete/abort states, event target VM binding, cleanups support).
  - [ ] Follow up on 3 remaining punted failures (1 in `exceptional-cases.html` on late-registered test status after cleanup errors, and 2 in `exceptional-cases-timeouts.html` on timeout exceptions).
- [x] **Broad Spec Conformance Crawler Expansion**:
  - [x] Expand the WPT sandbox crawler to read and execute tests under other core specification directories: `cssom/`, `css-syntax/`, `css-nesting/`, `css-variables/`, `selectors/`, `mediaqueries/`.
  - [x] Configure includes/excludes lists for these spec folders in `tests/wpt-sandbox-config.json`.
- [x] **Unified Multi-Spec Progress Logging**:
  - [x] Create `wpt-progress.md` logging progress across multiple specs.
  - [x] Update progress logging script (`scripts/update_wpt_progress.ts`) to run multiple spec folders, aggregate their test totals, and log progress using the following multi-column layout with spec totals in headers:
    ```markdown
    | Date & Time (UTC) | Commit | Typed OM (12150) | CSSOM (600) | Nesting (120) | Syntax (350) | Selectors (500) | MQ (200) | Overall | Pass Rate |
    | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
    ```
- [ ] **Code Review & Verification**:
  - [ ] Run Codex Reviewer over changes.
  - [ ] Verify Grizz gatekeeper green check.

---

## Potential roadmap items

Objective: Explore long-term ideas for WPT conformance, prototype patching options, and parser shorthand completeness.

### Ideas

#### 1. Spec-Compliance & API Surface Refinements
- [ ] **WebIDL Index Accessors via Proxy**: Return a `Proxy` from the `CSSNumericArray` constructor to throw a `RangeError` on out-of-bounds index writes.
- [ ] **Prototype Patching helper**: Export a `patchElementPrototype(HTMLElement)` utility from `src/index.ts` to allow users to opt-in to global DOM prototype patching.



