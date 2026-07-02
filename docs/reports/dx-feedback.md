# Developer Experience (DX) Feedback for cssomnom

This document captures feedback on the developer experience of using `cssomnom` for static analysis, from the perspective of an experienced JavaScript developer.

## 1. What's Confusing?

*   **Low-Level Parsing Dance in Quick Start**: The Quick Start guide shows this:
    ```typescript
    const tokens = tokenize(css);
    const parser = new Parser(tokens);
    const stylesheet = parser.parseStyleSheet();
    ```
    This exposed tokenizer feels like an implementation detail. As a user, I just want a high-level `parse(css)` function that returns a `CSSStyleSheet`. Having to manually tokenize first is unexpected boilerplate.
*   **Inconsistent Return Types**: The README lists `Parser.parseStyleSheetText(css: string): Rule[]` as a utility, but the Quick Start uses `parser.parseStyleSheet()` which returns a `CSSStyleSheet` object. It's confusing that the plural-sounding utility returns a raw array of rules instead of the stylesheet wrapper, especially since the standard CSSOM operates on `CSSStyleSheet`.
*   **`Rule` vs `CSSParserRule` vs `CSSStyleRule`**: The API reference mentions `CSS.parseStylesheet` returning `CSSParserRule[]` (Houdini style), while utilities return `Rule[]`, and standard CSSOM uses `CSSStyleRule`. The distinction between these similar-sounding types needs to be clearer in the documentation.

## 2. What Could Be Made More Clear?

*   **TypeScript Integration**: The examples use `.ts` files and show some types, but they don't explicitly show where to import standard types from (e.g., `CSSStyleSheet`, `CSSStyleRule`). If I'm in a TypeScript project, I want to know if I import them from the root or if they are just ambiently available because they mimic the spec.
*   **Realistic Static Analysis Examples**: The example for `getCascadedStyle` uses a manual mock element with a hardcoded `matches` method:
    ```typescript
    const element = {
      matches(selector: string) {
        return selector === '.box.highlight' || selector === '.box';
      }
    };
    ```
    This is a bit *too* simple for a static analysis tool. It would be much more helpful to see a realistic example showing how to use it with a lightweight DOM implementation like `linkedom` to parse an HTML file and assert on computed styles.

## 3. Where the Developer Experience is Lacking

*   **Missing Exports in the Main Entry Point**: `getCascadedStyle` is a highly advertised feature in the README, but it is **not exported** in `src/index.ts`. The README tells users to import it directly from the source file:
    ```typescript
    import { getCascadedStyle } from './src/cascade.ts';
    ```
    If I install this via `npm` as a pre-bundled package, deep-importing from `./src/...` will break. This should be exposed in the main entry point.
*   **Imports point to `./src/...` instead of the package**: All examples in the README use relative imports like `from './src/parser.ts'`. This reads like documentation for contributors to the repo rather than for consumers of the library. They should be updated to reflect how an external project would import them (e.g., `from 'cssomnom'`).

## Summary Recommendations for DX:
1.  Add a high-level `parse(css: string): CSSStyleSheet` function to remove the tokenizer boilerplate.
2.  Update `src/index.ts` to export `getCascadedStyle` and ensure all advertised features are accessible from the root package import.
3.  Update the README examples to use package-style imports (e.g., `import { ... } from 'cssomnom'`) and provide a more realistic example for the static analysis use case involving a DOM tree.
