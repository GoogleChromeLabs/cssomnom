# Compatibility Report: `cssomnom` vs. Legacy CSSOM Implementations

This report analyzes the compatibility story between our modern spec-compliant CSSOM parser and two common legacy implementations: the original `NV/CSSOM` and the maintained fork `rrweb-io/CSSOM`. It ends with a proposal for a compatibility layer to ease migration for existing users.

## 1. Investigation: `NV/CSSOM`

We investigated the original `NV/CSSOM` project located at `submodules/CSSOM`.

### API Surface
- Both implementations expose standard CSSOM interfaces (`CSSStyleDeclaration`, `CSSStyleSheet`, etc.).
- **Our Implementation**: Adds modern specification support (Nesting, Typed OM, CSS Layers, and `@property Descriptor`). We also implement the newer WICG Parser API (`CSS.parseStylesheet`), which `NV/CSSOM` lacks entirely.

### Drop-in Replacement Analysis
- We are **NOT** currently a drop-in replacement.
- `NV/CSSOM` uses a synchronous `parse(string)` that directly returns a `CSSStyleSheet` as its primary entry point.
- Our modern `CSS.parseStylesheet` is asynchronous and returns a sequence of rules instead.

### Breaking Changes
- The entry point names and return types are completely different.
- We currently lack a `clone()` method for rules.
- We do not support legacy IE `expression()` values.
- Our implementation is much stricter regarding spec compliance.

## 2. Investigation: `rrweb-io/CSSOM`

We investigated the maintained fork `rrweb-io/CSSOM` located at `submodules/rrweb-cssom`.

### API Surface
- **Very Similar**: Both expose standard CSSOM interfaces.
- **Our Wins**: We support **Constructable Stylesheets** (`replace`/`replaceSync`), **CSS Typed OM**, and the modern **WICG Parser API**, all of which `rrweb-io` lacks.
- **Their Wins**: `rrweb-io` contains a utility deep-`clone()` method for stylesheets and supports obsolete/IE rules (`CSSDocumentRule`, `Expression`) which we intentionally omit.

### Breaking Changes & Deviations
We are **mostly** a drop-in replacement for standard usage, but there is one critical technical difference:

- **`cssRules` Collection Type**:
  - `rrweb-io` implemented `sheet.cssRules` as a standard JavaScript `Array`.
  - Our project strictly follows the spec and uses a **`CSSRuleList`** (implemented via a Proxy to intercept indexed accessors).
  - **Impact**: Any code in `rrweb-io` that relies on `Array.prototype` methods (like `.push()`, `.map()`, or `.forEach()`) directly on `sheet.cssRules` **will throw a TypeError** in our implementation unless refactored to use `item()` or standard indexing.
- **Missing Top-Level `parse`**: They expect `const sheet = CSSOM.parse(cssText)`. We expect instantiation and calling `replaceSync`.
- **Property Access on `CSSStyleDeclaration`**: `rrweb-io` sets properties directly on the instance, while we use a `Proxy` to intercept calls and handle camelCase to dashed-ident conversion automatically.

## 3. Proposal for Compatibility Layer

To support existing users of both `NV/CSSOM` and `rrweb-io/CSSOM` and allow `cssomnom` to act as a drop-in replacement, we propose adding a small compatibility shim module (e.g., `src/compat.ts`) that provides the following features:

### Synchronous `parse` Entry Point
Provide a synchronous `parse` function that mimics the legacy behavior:

```typescript
import { CSSStyleSheet } from './CSSOM';

export function parse(cssText: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);
  return sheet;
}
```

### `CSSRuleList` Array Emulation
While retaining our spec-compliant `CSSRuleList` implementation, we can extend the Proxy in `CSSRuleList` or add non-standard array prototype methods to it to prevent crashes in legacy code:

```typescript
// In src/CSSOM.ts (CSSRuleList implementation)
// Add non-standard Array prototype methods to ease migration
(CSSRuleList.prototype as any).forEach = Array.prototype.forEach;
(CSSRuleList.prototype as any).map = Array.prototype.map;
```

### Missing Utilities
Implement the deep-`clone()` method for stylesheets to match the feature set of `rrweb-io/CSSOM`.

By providing this compatibility layer in a dedicated, non-default module (e.g., `import * as CSSOM from 'cssomnom/compat'`), we can empower legacy users to adopt our modern, high-fidelity parser without having to rewrite their existing codebases, all while keeping our default build clean and spec-conforming.
