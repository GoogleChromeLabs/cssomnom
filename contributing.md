# Contributing to cssomnom

Thank you for your interest in contributing to `cssomnom`! We are building a spec-compliant CSSOM (CSS Object Model) parser in pure TypeScript.

To ensure the codebase remains maintainable, performant, and strictly aligned with official specifications, please adhere to the following guidelines.

## Getting Started & Submodules

This repository uses Git submodules (located in the `submodules/` directory) to import W3C Web Platform Tests (WPT) and other reference parsers for compatibility testing.

### Cloning the Repository

- **For standard usage and development** (without running compatibility tests):
  You can perform a standard clone to save time and disk space, omitting the submodules:
  ```bash
  git clone https://github.com/google/cssomnom.git
  ```

- **For full development (running the conformance test suite)**:
  You must initialize and update the submodules:
  ```bash
  git clone --recursive https://github.com/google/cssomnom.git
  ```
  Or, if you have already cloned, initialize them using:
  ```bash
  pnpm run submodules:update
  ```

## Coding Rules

### TypeScript & Node.js
- **Execution**: Run node scripts directly: `node script.ts`. Do NOT use `npx tsx` or `ts-node`. We use erasable syntax in current Node.
- **TypeScript strictly**: 
  - Prefer `ts-expect-error` over `ts-ignore`. Attempt to avoid both and avoid `any` when possible.
  - Always use type guards instead of type coercion or non-null assertions.
  - Make use of optional chaining, when appropriate.
- **No any**: Avoid `/** @type {any} */`. It is lazy.

## Spec Compliance & Testing Guidelines

We are building a spec-compliant implementation. Adhere to the W3C specifications listed in `API_BOUNDARIES.md` except where intentional deviations are documented.

- **Executable Specification**: When implementing algorithms from the CSS specs, add comments citing the specific spec sections (e.g., `// 5.5.3 Consume a qualified rule` or `cssom-1 #parsing-selectors`) to map code directly to the spec.
- **WPT Fixtures**: Continuously look for and extract new test fixtures and test cases from the W3C Web Platform Tests (WPT) submodule to ensure high conformance.
- **Red/Green TDD**: Prefer test-driven development when fixing bugs or compliance gaps. Write a failing test first to demonstrate the issue (Red), then implement the fix to make it pass (Green). This protects against building tests that pass by accident.
- **Bug Fixes & Regression Tests**: Whenever you fix a bug or a spec non-compliance, you MUST add a corresponding regression test to ensure the bug does not return. Do not simply fix the code without verifying it with a test.

## Architectural Constraints

### Circular Dependency Management (`ParseHooks`)
To avoid circular dependencies between the core parser and the CSSOM/Typed OM layers, we use a Dependency Inversion pattern via `src/parse-hooks.ts`.
- **Rule**: Do NOT import `Parser` directly into `src/CSSOM.ts` or `src/typed-om.ts`.
- **Solution**: Use `ParseHooks.parseComponentValues()`, `ParseHooks.consumeRule()`, etc. The implementation is injected into these hooks at the bottom of `src/parser.ts`.

### API Boundaries
We intentionally deviate from some specifications for pragmatism, performance, or Node.js compatibility (e.g., providing synchronous versions of Houdini APIs).
- **Rule**: Before proposing refactors to align strictly with IDL, review `API_BOUNDARIES.md` to understand documented intentional deviations.

## Spec Evolution & Maintainability

### Automation Over Hardcoding
As CSS specifications evolve, this codebase must evolve with them. We prioritize automation over manual maintenance for spec-derived data.
- **Rule**: Whenever adding support for new properties, values, units, or features that are documented in external data sources (like `mdn-data` or `@webref/css`), ALWAYS prefer updating or creating a code generation script in `scripts/codegen/` rather than hardcoding lists in implementation files.
- **Rule**: Ensure that any new generation script is added to the master script `scripts/generate_all.ts` and that the `pnpm run codegen` command functions correctly.
- **Rule**: The `maintain` script in `package.json` must always include `pnpm run codegen` to ensure that updating submodules automatically updates our generated data.
