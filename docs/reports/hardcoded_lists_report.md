# CSSOM Hardcoded Lists Audit Report

This report details the findings of an audit conducted on the `cssomnom` source files to identify hardcoded lists of CSS properties, values, units, and media features.

## Executive Summary
The audit revealed that the codebase relies heavily on hardcoded lists across multiple core files. While some of these lists are relatively static (like math functions), others representing rapidly evolving specifications (like property names, shorthands, and units) are at high risk of becoming stale. In fact, the audit identified an **active bug** in `src/units.ts` where the `unitToBase` map is incomplete, missing many modern units defined in the `CSSUnit` type.

The recommended long-term strategy is to introduce a **build-time code generation pipeline** utilizing external data sources like `mdn-data` and `@webref/css` to keep these lists and TypeScript interfaces automatically synchronized with the latest standards.

---

## Evaluation of `mdn-data` and `@webref/css`

An investigation into `mdn-data` (v2.28.0) and `@webref/css` (v8.5.3) demonstrates that they can eliminate almost all of the hardcoded lists in the parser. 

### 1. `@webref/css` Capabilities
This package parses CSS specifications directly and provides machine-readable datasets.
- **Properties**: Provides a comprehensive list of 712+ CSS properties.
  - *Logical Mapping*: Includes metadata like `"logicalPropertyGroup": "margin"` and `"syntax": "<'margin-top'>"` which can be parsed to automatically generate logical-to-physical property mappings.
- **Media Features**: Provides an array of descriptors and features for `@media` in `atrules`. We can extract 40+ media features (e.g. `prefers-color-scheme`, `width`), their `type` (`range` vs `discrete`), and `syntax`.
- **Functions**: Provides an array of 162+ CSS functions, from which we can extract math functions like `calc()`, `sin()`, `round()`.

### 2. `mdn-data` Capabilities
This package provides curated data powering MDN Web Docs.
- **Shorthands**: For any shorthand property (e.g. `background`, `border-radius`), `mdn-data` provides an `"initial"` or `"computed"` property that is an array of its constituent longhand properties. This is perfect for generating the shorthand expansion maps.
- **Selectors**: Provides an extensive list of 144+ pseudo-classes and pseudo-elements (e.g. `:hover`, `::first-letter`).
- **Units**: `mdn-data` has a `css.units` object, but it currently only contains ~30 older units and is **missing modern units** like `svw`, `lvw`, `vi`, `dvw`, `q`, etc. 

---

## Detailed Findings & Solutions

### 1. `src/LogicalMapping.ts`
- **What**: `LOGICAL_MAPPING` object mapping logical properties to physical properties.
- **Risk**: Medium. Misses newer logical properties like `scroll-margin-block` and `scroll-padding-block`.
- **Solution**: Generate this mapping directly from `@webref/css` by parsing the `syntax` and `logicalPropertyGroup` metadata on properties.

### 2. `src/types.ts`
- **What**: `CSSStyleProperties` interface containing ~365 explicit CSS property names.
- **Risk**: High. Will easily drift out of date as new properties are standardized.
- **Solution**: Automate generation of this interface from `@webref/css` properties array or `mdn-data`.

### 3. `src/shorthands.ts`
- **What**: `SHORTHANDS` object mapping shorthand names to component longhands.
- **Risk**: High. Tedious to maintain manually; covers only a small subset of shorthands.
- **Solution**: Generate shorthand component lists from `mdn-data`'s `css.properties`. Any property where `"initial"` is an array of strings defines a shorthand and its longhands.

### 4. `src/units.ts` & `src/typed-om.ts`
- **What**: Mappings like `unitToBase` in `src/units.ts` and `CSSUnit` string union type.
- **Risk**: **High (Active Bug)**. `unitToBase` lacks entries for many modern units.
- **Solution**: Neither `mdn-data` nor `@webref/css` currently export an easily consumable, up-to-date list of all CSS units. We should centralize unit definitions in a single local JSON/YAML configuration file and use it to generate both the TypeScript types and the mapping dictionaries, until upstream packages expose them.

### 5. `src/MediaParser.ts`
- **What**: `KNOWN_FEATURES`, `FEATURE_VALUE_TYPES`, `FEATURE_ALLOWED_IDENTS` maps.
- **Risk**: High. Media features are frequently added in Media Queries Level 4/5.
- **Solution**: Build a generation script using `@webref/css`. The `atrules` export for `@media` contains a `values` array that explicitly lists all features, whether they are `range` or `discrete`, and their allowed idents/syntax.

### 6. `src/PropertyRegistry.ts`
- **What**: `VALID_COMPONENTS`, reserved words, and computationally independent units.
- **Risk**: Medium. Redefines lists locally that could be shared.
- **Solution**: Pull units from the centralized local configuration, and pull global reserved words from `mdn-data` or `@webref/css` syntaxes.

### 7. `src/math-parser.ts`
- **What**: `MATH_FUNCTIONS` array.
- **Risk**: Low to Medium. Localized duplication of spec-level knowledge.
- **Solution**: Extract and filter the math functions from `@webref/css`'s `functions` list.

### 8. `src/SelectorParser.ts`
- **What**: Lists of pseudo-classes and pseudo-elements.
- **Risk**: Medium. New pseudo-classes are added frequently.
- **Solution**: Generate lists of pseudo-classes and elements from `mdn-data`'s `css.selectors`.
