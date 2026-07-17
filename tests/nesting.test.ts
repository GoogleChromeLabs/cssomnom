/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getCascadedStyle } from '../src/cascade.ts';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import type { Rule, Declaration } from '../src/types.ts';
import { CSSStyleRule, CSSNestedDeclarations, CSSMediaRule, CSSScopeRule } from '../src/index.ts';

describe('CSS Nesting', () => {
    test('nested selector with &', () => {
        const css = `
            .parent {
                color: red;
                & .child { color: blue; }
                &:hover { color: green; }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const elementChild = {
            matches(sel: string) {
                // Our implementation serializes as :is(.parent) .child
                return sel === ':is(.parent) .child';
            }
        };
        const styleChild = getCascadedStyle(elementChild, Array.from(stylesheet.cssRules) as unknown as Rule[]);
        assert.strictEqual(styleChild.color, 'blue');

        const elementHover = {
            matches(sel: string) {
                return sel === ':is(.parent):hover';
            }
        };
        const styleHover = getCascadedStyle(elementHover, Array.from(stylesheet.cssRules) as unknown as Rule[]);
        assert.strictEqual(styleHover.color, 'green');
    });

    test('nested selector without & (implicit descendant)', () => {
        const css = `
            .parent {
                .child { color: blue; }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const elementChild = {
            matches(sel: string) {
                // Implicitly it becomes '& .child' which is ':is(.parent) .child'
                return sel === ':is(.parent) .child';
            }
        };
        const styleChild = getCascadedStyle(elementChild, Array.from(stylesheet.cssRules) as unknown as Rule[]);
        assert.strictEqual(styleChild.color, 'blue');
    });

    test('root-level & resolves to :where(:scope)', () => {
        const css = `
            & { color: red; }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const element = {
            matches(sel: string) {
                return sel === ':where(:scope)';
            }
        };
        const style = getCascadedStyle(element, Array.from(stylesheet.cssRules) as unknown as Rule[]);
        assert.strictEqual(style.color, 'red');
    });

    test('nested @scope prelude absolutizes &', () => {
        const css = `
            .parent {
                @scope (> .scope) {
                    .child { color: blue; }
                }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const rules = Array.from(stylesheet.cssRules);
        assert.strictEqual(rules.length, 1);
        const parentRule = rules[0] as unknown as CSSStyleRule;
        
        assert.strictEqual(parentRule.cssRules.length, 1);
        const scopeRule = parentRule.cssRules[0];
        
        assert.strictEqual(scopeRule.cssText.startsWith('@scope (> .scope)'), true);
    });

    test('nested @scope prelude does not add & to non-relative selector', () => {
        const css = `
            .parent {
                @scope (.card) {
                    .child { color: blue; }
                }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const rules = Array.from(stylesheet.cssRules);
        const parentRule = rules[0] as unknown as CSSStyleRule;
        const scopeRule = parentRule.cssRules[0];
        
        assert.strictEqual(scopeRule.cssText.startsWith('@scope (.card)'), true);
    });

    test('CSSNestedDeclarations serialization filters empty strings', () => {
        const decls: Declaration[] = [];
        const nestedDecls = new CSSNestedDeclarations(decls);
        
        const decl1: Declaration = { type: 'declaration', name: 'color', value: [{ type: 'ident', value: 'red' }], important: false };
        const styleRule = new CSSStyleRule(
            '.foo',
            [decl1],
            [nestedDecls],
            (_text: string) => ({} as unknown as Rule),
            null
        );
        
        const cssText = styleRule.cssText;
        const expected = '.foo {\n  color: red;\n}';
        assert.strictEqual(cssText, expected);
    });

    test('serializeGroupingRule filters empty strings from nested rules', () => {
        const decls: Declaration[] = [];
        const nestedDecls = new CSSNestedDeclarations(decls);
        
        const mediaRule = new CSSMediaRule(
            'screen',
            [nestedDecls as unknown as Rule],
            (_text: string) => ({} as unknown as Rule)
        );
        
        const cssText = mediaRule.cssText;
        const expected = '@media screen { }';
        assert.strictEqual(cssText, expected);
    });

    test('nested selector with & inside function', () => {
        const css = `
            .parent {
                :is(&) .child { color: blue; }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const rules = Array.from(stylesheet.cssRules);
        assert.strictEqual(rules.length, 1);
        const parentRule = rules[0] as CSSStyleRule;
        assert.strictEqual(parentRule.cssRules.length, 1);
        const childRule = parentRule.cssRules[0] as CSSStyleRule;
        
        assert.strictEqual(childRule.selectorText, ':is(&) .child');
    });

    test('declarations separated by invalid rule are split', () => {
        const css = `
            .foo {
                color: red;
                invalid rule;
                background: blue;
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const rules = Array.from(stylesheet.cssRules);
        assert.strictEqual(rules.length, 1);
        const fooRule = rules[0] as CSSStyleRule;
        
        // We expect color to be in fooRule.style
        assert.strictEqual(fooRule.style.getPropertyValue('color'), 'red');
        // background should NOT be in fooRule.style because it was split
        assert.strictEqual(fooRule.style.getPropertyValue('background'), '');
        
        // and we expect 1 child rule (the second CSSNestedDeclarations)
        assert.strictEqual(fooRule.cssRules.length, 1);
        const childRule = fooRule.cssRules[0] as CSSNestedDeclarations;
        assert.strictEqual(childRule.style.getPropertyValue('background'), 'blue');
    });

    test('top-level @media ignores declarations directly in it', () => {
        const css = `
            @media screen {
                color: red;
                .foo { color: blue; }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const rules = Array.from(stylesheet.cssRules);
        assert.strictEqual(rules.length, 1);
        const mediaRule = rules[0] as CSSMediaRule;
        
        // Should NOT contain the declaration, only the style rule
        assert.strictEqual(mediaRule.cssRules.length, 1);
        assert.strictEqual(mediaRule.cssRules[0] instanceof CSSStyleRule, true);
        const styleRule = mediaRule.cssRules[0] as CSSStyleRule;
        assert.strictEqual(styleRule.selectorText, '.foo');
    });

    test('element.matches() throwing DOMException does not crash cascade', () => {
        const css = `
            .parent {
                color: red;
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const element = {
            matches(_sel: string) {
                throw new Error('DOMException: Simulated failure');
            }
        };
        
        // Should not throw and return empty style because no match
        const style = getCascadedStyle(element, Array.from(stylesheet.cssRules) as unknown as Rule[]);
        assert.deepStrictEqual(style, {});
    });

    test('consumeQualifiedRule respects nested flag', () => {
        const css = `.child { color: blue; }`;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const rule = parser.consumeRule(true);
        
        assert.ok(rule instanceof CSSStyleRule);
        assert.strictEqual(rule.selectorText, '& .child');
    });

    test('CSSNestedDeclarations style attribute PutForwards=cssText', () => {
        const nestedDecls = new CSSNestedDeclarations([]);
        nestedDecls.style = 'color: green; margin: 10px;';
        assert.strictEqual(nestedDecls.style.cssText.trim(), 'color: green; margin: 10px;');
        assert.strictEqual(nestedDecls.style.getPropertyValue('color'), 'green');
        assert.strictEqual(nestedDecls.style.getPropertyValue('margin'), '10px');
    });

    test('nested rule starting with element name like div:hover should be parsed as rule, not declaration', () => {
        const css = `
            .parent {
                div:hover { color: blue; }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const rules = Array.from(stylesheet.cssRules);
        assert.strictEqual(rules.length, 1);
        const parentRule = rules[0] as unknown as CSSStyleRule;
        
        assert.strictEqual(parentRule.cssRules.length, 1);
        // It should be a CSSStyleRule!
        // Wait, parentRule.cssRules[0] is CSSStyleRule if parsed correctly,
        // or CSSNestedDeclarations if it was incorrectly parsed as declaration!
        // Let's assert it starts with "div:hover" (which means it's a style rule).
        assert.strictEqual(parentRule.cssRules[0].cssText.trim().startsWith('& div:hover'), true);
    });

    test('consumeBlockContents recovers from invalid declaration containing curly blocks', () => {
        const css = `
            .parent {
                color: red {
                    a: b;
                }
                background: blue;
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const rules = Array.from(stylesheet.cssRules);
        assert.strictEqual(rules.length, 1);
        const parentRule = rules[0] as unknown as CSSStyleRule;
        
        // The invalid declaration should be skipped, background: blue is parsed.
        assert.strictEqual(parentRule.cssRules.length, 0);
        assert.strictEqual(parentRule.style.getPropertyValue('background').trim(), 'blue');
    });

    test('relative nested selector absolutizes in selectorText setter', () => {
        const css = `
            .parent {
                .child { color: blue; }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        const parentRule = stylesheet.cssRules[0] as CSSStyleRule;
        const childRule = parentRule.cssRules[0] as CSSStyleRule;
        
        // Setting a relative selector on a nested rule should absolutize it:
        childRule.selectorText = '> div';
        assert.strictEqual(childRule.selectorText, '& > div');

        childRule.selectorText = '+ p, ~ span';
        assert.strictEqual(childRule.selectorText, '& + p, & ~ span');
        
        // Setting it on a non-nested rule (top-level) should NOT absolutize it,
        // in fact it is invalid so it should be ignored (keep the original).
        const topLevelRule = stylesheet.cssRules[0] as CSSStyleRule;
        const originalSelector = topLevelRule.selectorText;
        topLevelRule.selectorText = '> div';
        assert.strictEqual(topLevelRule.selectorText, originalSelector);
    });

    test('@scope resets parent selector context (&) to :where(:scope)', () => {
        const css = `
            .parent {
                @scope (.scope-root) {
                    & .child { color: blue; }
                }
            }
        `;
        const tokens = tokenize(css);
        const parser = new Parser(tokens);
        const stylesheet = parser.parseStyleSheet();
        
        const parentRule = stylesheet.cssRules[0] as CSSStyleRule;
        const scopeRule = parentRule.cssRules[0] as CSSScopeRule;
        const childRules = Array.from(scopeRule.cssRules) as Rule[];
        
        const elementScopeChild = {
            matches(sel: string) {
                return sel === ':where(:scope) .child';
            }
        };
        
        const style = getCascadedStyle(elementScopeChild, childRules);
        assert.strictEqual(style.color, 'blue');
    });
});


