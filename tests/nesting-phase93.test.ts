/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parse, CSSStyleSheet, CSSStyleRule, CSSMediaRule } from "../src/index.ts";
import { getCascadedStyle } from "../src/cascade.ts";

describe("Phase 93: CSS Nesting 1 Conformance & CSSNestedDeclarations Lifecycle", () => {
  describe("1. Empty CSSNestedDeclarations Serialization & Whitespace Formatting (css-nesting-1 § 4.1 #the-cssnesteddeclarations-interface)", () => {
    test("omits empty CSSNestedDeclarations from outer rule serialization", () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`
        .a {
          & { }
          left: 1px;
          & { }
          right: 1px;
        }
      `);
      assert.strictEqual(sheet.cssRules.length, 1);
      const aRule = sheet.cssRules[0] as CSSStyleRule;
      assert.strictEqual(aRule.cssRules.length, 4);

      for (const childRule of aRule.cssRules) {
        (childRule as unknown as { style: string }).style = "";
      }
      assert.strictEqual(aRule.cssText, ".a {\n  & { }\n  & { }\n}");
    });

    test("omits empty CSSNestedDeclarations in nested grouping rules", () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`
        .a {
          @media (width > 1px) {
            & { }
            left: 1px;
            & { }
            right: 1px;
          }
        }
      `);
      assert.strictEqual(sheet.cssRules.length, 1);
      const outer = sheet.cssRules[0] as CSSStyleRule;
      assert.strictEqual(outer.cssRules.length, 1);
      const media = outer.cssRules[0] as CSSMediaRule;
      assert.strictEqual(media.cssRules.length, 4);

      for (const childRule of media.cssRules) {
        (childRule as unknown as { style: string }).style = "";
      }
      assert.strictEqual(media.cssText, "@media (width > 1px) {\n  & { }\n  & { }\n}");
    });

    test("formats empty style rules and conditional rules correctly", () => {
      const emptyStyle = parse("div { }");
      assert.strictEqual(sheetSerialization(emptyStyle), "div { }");

      const emptyMedia = parse("@media screen {\n}");
      assert.strictEqual(sheetSerialization(emptyMedia), "@media screen {\n}");

      const nestedGroup = parse("div {\n  @media screen {\n  &.a { color: red; }\n}\n}");
      assert.strictEqual(
        (nestedGroup.cssRules[0] as CSSStyleRule).cssText,
        "div {\n  @media screen {\n  &.a { color: red; }\n}\n}"
      );
    });
  });

  describe("2. Outer selectorText Mutation Propagation & Cascade Invalidation (css-nesting-1 § 4 #cssom)", () => {
    test("invalidates cascade matching when outer selectorText is mutated", () => {
      const sheet = parse(`
        .a {
          & { z-index: 1; }
          & .child { z-index: 2; }
          .other, :is(&) .alt { z-index: 3; }
        }
      `);

      const rootA = {
        className: "a",
        matches(sel: string) {
          if (sel === ".a" || sel === ":is(.a)" || sel === ":scope") return true;
          return false;
        }
      };

      const childEl = {
        className: "child",
        parentElement: rootA,
        matches(sel: string) {
          if (sel.includes(".a") && sel.includes(".child")) return true;
          if (sel === ":is(.a) .child") return true;
          return false;
        }
      };

      // Before mutation: matches .a
      let childStyle = getCascadedStyle(childEl, Array.from(sheet.cssRules));
      assert.strictEqual(childStyle.getPropertyValue("z-index"), "2");

      // Mutate outer selectorText: .a -> .b
      (sheet.cssRules[0] as CSSStyleRule).selectorText = ".b";
      assert.strictEqual((sheet.cssRules[0] as CSSStyleRule).selectorText, ".b");

      // After mutation: childEl should no longer match because root has class a, not b
      childStyle = getCascadedStyle(childEl, Array.from(sheet.cssRules));
      assert.strictEqual(childStyle.getPropertyValue("z-index"), "");

      // Element with class b should match now
      const rootB = {
        className: "b",
        matches(sel: string) {
          if (sel === ".b" || sel === ":is(.b)" || sel === ":scope") return true;
          return false;
        }
      };
      const childB = {
        className: "child",
        parentElement: rootB,
        matches(sel: string) {
          if (sel.includes(".b") && sel.includes(".child")) return true;
          if (sel === ":is(.b) .child") return true;
          return false;
        }
      };
      const childBStyle = getCascadedStyle(childB, Array.from(sheet.cssRules));
      assert.strictEqual(childBStyle.getPropertyValue("z-index"), "2");
    });
  });

  describe("3. Leading Combinator Desugaring in Relative Selectors (css-nesting-1 § 3 #nest-selector)", () => {
    test("desugars leading combinators across comma-separated selector lists", () => {
      const sheet1 = parse(".foo { + .bar, .foo, > .baz { color: green; }}");
      const innerRule1 = (sheet1.cssRules[0] as CSSStyleRule).cssRules[0] as CSSStyleRule;
      assert.strictEqual(innerRule1.selectorText, "& + .bar, & .foo, & > .baz");

      const sheet2 = parse(".foo { .foo, .foo & { color: green; }}");
      const innerRule2 = (sheet2.cssRules[0] as CSSStyleRule).cssRules[0] as CSSStyleRule;
      assert.strictEqual(innerRule2.selectorText, "& .foo, .foo &");

      const sheet3 = parse(".foo { .foo, .bar { color: green; }}");
      const innerRule3 = (sheet3.cssRules[0] as CSSStyleRule).cssRules[0] as CSSStyleRule;
      assert.strictEqual(innerRule3.selectorText, "& .foo, & .bar");

      const sheet4 = parse(".foo { > .bar { color: green; }}");
      const innerRule4 = (sheet4.cssRules[0] as CSSStyleRule).cssRules[0] as CSSStyleRule;
      assert.strictEqual(innerRule4.selectorText, "& > .bar");
    });
  });

  describe("4. DOMException Error Hierarchy Validation (cssom-1 § 6.4.3 & css-nesting-1 § 4.1)", () => {
    test("throws SyntaxError when inserting CSSNestedDeclarations into top-level @media rule", () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync("@media (width > 100px) {}");
      const mediaRule = sheet.cssRules[0] as CSSMediaRule;
      assert.throws(() => {
        mediaRule.insertRule("width: 100px; height: 200px;");
      }, (err: Error) => {
        return err.name === "SyntaxError";
      });
    });

    test("throws SyntaxError when inserting empty declarations", () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(".a {}");
      const aRule = sheet.cssRules[0] as CSSStyleRule;

      assert.throws(() => {
        aRule.insertRule("");
      }, (err: Error) => err.name === "SyntaxError");
    });

    test("throws HierarchyRequestError when inserting unnestable at-rules into nested rules", () => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync("div { @media screen { &.a { color: red; } } }");
      const divRule = sheet.cssRules[0] as CSSStyleRule;
      const mediaRule = divRule.cssRules[0] as CSSMediaRule;

      assert.throws(() => {
        divRule.insertRule("@font-face {}", 0);
      }, (err: Error) => err.name === "HierarchyRequestError");

      assert.throws(() => {
        mediaRule.insertRule("@font-face {}", 0);
      }, (err: Error) => err.name === "HierarchyRequestError");

      assert.throws(() => {
        divRule.insertRule("@keyframes spin {}", 0);
      }, (err: Error) => err.name === "HierarchyRequestError");
    });
  });
});

function sheetSerialization(sheet: CSSStyleSheet): string {
  return Array.from(sheet.cssRules).map(r => r.cssText).join("\n");
}
