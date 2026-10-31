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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse,
  CSSStyleSheet,
  CSSRule,
  CSSStyleRule,
  CSSMediaRule,
  CSSSupportsRule,
  CSSContainerRule,
  CSSStartingStyleRule,
  CSSLayerBlockRule,
  CSSScopeRule,
  CSSKeyframesRule,
  CSSKeyframeRule,
  CSSNestedDeclarations,
  CSSPageRule,
  CSSPositionTryRule,
  CSSPositionTryDescriptors,
  CSSAtRule,
  getRules,
  closestRule,
  resolveSelector,
  parseSelectorAST,
  getDeclaredProperties,
  getPropertyValues,
  getCascadedStyle,
  matches,
} from '../src/entry/index.ts';
import { parseHTML } from 'linkedom';

describe('src/walk.ts: Pure-CSSOM Traversal, Selector Resolution, and Property Queries', () => {
  it('collects all rules in depth-first pre-order and filters by ruleClass when specified', () => {
    const css = [
      '@media (min-width: 600px) {',
      '  .card {',
      '    color: red;',
      '    & .title {',
      '      font-size: 16px;',
      '    }',
      '  }',
      '}',
      '@keyframes fade {',
      '  from { opacity: 0; }',
      '  to { opacity: 1; }',
      '}',
    ].join('\n');

    const sheet = parse(css);
    const rules = getRules(sheet);

    // Order:
    // 0: CSSMediaRule
    // 1: CSSStyleRule (.card)
    // 2: CSSStyleRule (& .title)
    // 3: CSSKeyframesRule
    // 4: CSSKeyframeRule (from)
    // 5: CSSKeyframeRule (to)
    assert.equal(rules.length, 6);

    const [mediaRule, cardRule, titleRule, kfRule, fromRule, toRule] = rules;

    assert.ok(mediaRule instanceof CSSMediaRule);
    assert.equal(mediaRule.parentRule, null);
    assert.equal(resolveSelector(mediaRule), null);

    // .card inside @media
    assert.ok(cardRule instanceof CSSStyleRule);
    assert.equal(cardRule.parentRule === mediaRule, true);
    assert.equal(closestRule(cardRule, CSSMediaRule) === mediaRule, true);
    assert.equal(closestRule(cardRule, CSSStyleRule), null);
    assert.equal(cardRule.selectorText, '.card');
    assert.equal(resolveSelector(cardRule), '.card');

    // & .title inside .card inside @media
    assert.ok(titleRule instanceof CSSStyleRule);
    assert.equal(titleRule.parentRule === cardRule, true);
    assert.equal(closestRule(titleRule, CSSStyleRule) === cardRule, true);
    assert.equal(closestRule(titleRule, CSSMediaRule) === mediaRule, true);
    assert.equal(titleRule.selectorText, '& .title');
    assert.equal(resolveSelector(titleRule), ':is(.card) .title');

    // @keyframes and keyframe rules
    assert.ok(kfRule instanceof CSSKeyframesRule);
    assert.equal(kfRule.parentRule, null);

    assert.ok(fromRule instanceof CSSKeyframeRule);
    assert.equal(fromRule.parentRule === kfRule, true);
    assert.equal(closestRule(fromRule, CSSKeyframesRule) === kfRule, true);
    assert.equal(resolveSelector(fromRule), '0%');
    assert.equal(fromRule.style.getPropertyValue('opacity'), '0');

    assert.ok(toRule instanceof CSSKeyframeRule);
    assert.equal(toRule.parentRule === kfRule, true);
    assert.equal(closestRule(toRule, CSSKeyframesRule) === kfRule, true);
    assert.equal(resolveSelector(toRule), '100%');
    assert.equal(toRule.style.getPropertyValue('opacity'), '1');

    // Dynamically appended keyframe rule preserves proxy identity on parentRule
    kfRule.appendRule('50% { opacity: 0.5; }');
    const midRule = kfRule.findRule('50%');
    assert.ok(midRule instanceof CSSKeyframeRule);
    assert.equal(midRule.parentRule === kfRule, true);
    assert.equal(closestRule(midRule, CSSKeyframesRule) === kfRule, true);

    // Filtered getRules(sheet, CSSStyleRule)
    const styleRules = getRules(sheet, CSSStyleRule);
    assert.equal(styleRules.length, 2);
    assert.equal(styleRules[0] === cardRule, true);
    assert.equal(styleRules[1] === titleRule, true);

    // Subtree traversal starting at mediaRule
    const mediaStyleRules = getRules(mediaRule, CSSStyleRule);
    assert.equal(mediaStyleRules.length, 2);
  });

  it('closestRule finds enclosing at-rules (@supports, @container, @starting-style, @layer, @scope)', () => {
    const css = [
      '@supports (display: grid) {',
      '  .grid { display: grid; }',
      '}',
      '@container (min-width: 400px) {',
      '  .box { padding: 8px; }',
      '}',
      '@starting-style {',
      '  .dialog { opacity: 0; }',
      '}',
      '@layer utilities {',
      '  .u-flex { display: flex; }',
      '}',
      '@scope (.card) to (.content) {',
      '  .header { color: blue; }',
      '}',
    ].join('\n');

    const sheet = parse(css);
    const styleRules = getRules(sheet, CSSStyleRule);
    assert.equal(styleRules.length, 5);

    assert.equal(closestRule(styleRules[0], CSSSupportsRule)?.conditionText, '(display: grid)');
    assert.equal(closestRule(styleRules[1], CSSContainerRule)?.conditionText, '(min-width: 400px)');
    assert.equal(closestRule(styleRules[2], CSSStartingStyleRule) instanceof CSSStartingStyleRule, true);
    assert.equal(closestRule(styleRules[3], CSSLayerBlockRule)?.name, 'utilities');
    const scopeRule = closestRule(styleRules[4], CSSScopeRule);
    assert.equal(scopeRule?.start, '.card');
    assert.equal(scopeRule?.end, '.content');
    assert.equal(closestRule(styleRules[4], CSSStyleRule, CSSScopeRule) instanceof CSSScopeRule, true);
  });

  it('resolves selectors for CSSNestedDeclarations, relative nested rules, and CSSPageRule', () => {
    const css = [
      '.card {',
      '  padding: 10px;',
      '  @media (min-width: 600px) {',
      '    color: red;',
      '    span { font-weight: bold; }',
      '  }',
      '}',
      '@page :first { margin: 1cm; }',
    ].join('\n');

    const sheet = parse(css);
    const [cardRule, spanRule] = getRules(sheet, CSSStyleRule);
    const [nestedDecl] = getRules(sheet, CSSNestedDeclarations);
    const [pageRule] = getRules(sheet, CSSPageRule);

    assert.equal(resolveSelector(cardRule), '.card');
    assert.equal(resolveSelector(nestedDecl), '.card');
    assert.equal(closestRule(nestedDecl, CSSMediaRule)?.conditionText, '(min-width: 600px)');
    assert.equal(nestedDecl.style.getPropertyValue('color'), 'red');

    assert.equal(spanRule.selectorText, '& span');
    assert.equal(resolveSelector(spanRule), ':is(.card) span');
    assert.equal(resolveSelector(pageRule), ':first');
  });

  it('inherits :scope selector for CSSNestedDeclarations and expands & / relative selectors inside @scope', () => {
    const sheet1 = parse('@scope (.article) { color: black; & .title { font-weight: bold; } > .direct { margin: 0; } .plain { color: gray; } }');
    const [decl1] = getRules(sheet1, CSSNestedDeclarations);
    assert.equal(resolveSelector(decl1), ':scope');

    const [ampRule, relRule, plainRule] = getRules(sheet1, CSSStyleRule);
    assert.equal(resolveSelector(ampRule), ':is(:scope) .title');
    assert.equal(resolveSelector(relRule), ':is(:scope) > .direct');
    assert.equal(resolveSelector(plainRule), '.plain');

    const ampAst = parseSelectorAST(ampRule);
    assert.ok(ampAst);
    const firstComplex = ampAst.selectors[0];
    assert.equal(firstComplex.type, 'complex-selector');
    if (firstComplex.type === 'complex-selector') {
      const firstCompound = firstComplex.items[0];
      assert.equal(firstCompound.type, 'compound-selector');
      if (firstCompound.type === 'compound-selector') {
        assert.equal(firstCompound.selectors[0].type, 'pseudo-class-selector');
      }
    }

    const sheet2 = parse('.card { @scope (.inner) { color: red; } }');
    const [decl2] = getRules(sheet2, CSSNestedDeclarations);
    assert.equal(resolveSelector(decl2), ':scope');
    assert.equal(closestRule(decl2, CSSScopeRule)?.start, '.inner');
    assert.equal(closestRule(decl2, CSSStyleRule)?.selectorText, '.card');
  });

  it('recurses into CSSAtRule.childRules when custom atRules are configured', () => {
    const sheet = parse('@custom-group { .inside { color: green; } }', {
      atRules: { 'custom-group': 'rule' },
    });
    const atRules = getRules(sheet, CSSAtRule);
    assert.equal(atRules.length, 1);
    const styleRules = getRules(sheet, CSSStyleRule);
    assert.equal(styleRules.length, 1);
    assert.equal(styleRules[0].selectorText, '.inside');
    assert.equal(closestRule(styleRules[0], CSSAtRule) === atRules[0], true);
  });

  it('parseSelectorAST parses selector strings and CSSStyleRules (with and without nesting resolution)', () => {
    const sheet = parse('.card { & > .title:hover { color: blue; } }');
    const [cardRule, titleRule] = getRules(sheet, CSSStyleRule);

    // Top-level rule returns AST directly
    const cardAst = parseSelectorAST(cardRule);
    assert.ok(cardAst);
    assert.equal(cardAst.selectors.length, 1);

    // Nested rule resolves & by default (resolveNesting: true)
    const resolvedTitleAst = parseSelectorAST(titleRule);
    assert.ok(resolvedTitleAst);
    const firstComplex = resolvedTitleAst.selectors[0];
    assert.equal(firstComplex.type, 'complex-selector');
    if (firstComplex.type === 'complex-selector') {
      const firstCompound = firstComplex.items[0];
      assert.equal(firstCompound.type, 'compound-selector');
      if (firstCompound.type === 'compound-selector') {
        assert.equal(firstCompound.selectors[0].type, 'pseudo-class-selector');
        if (firstCompound.selectors[0].type === 'pseudo-class-selector') {
          assert.equal(firstCompound.selectors[0].name, 'is');
        }
      }
    }

    // Raw selector AST on nested rule (resolveNesting: false) preserves nesting-selector (&)
    const rawTitleAst = parseSelectorAST(titleRule, { resolveNesting: false });
    assert.ok(rawTitleAst);
    const rawComplex = rawTitleAst.selectors[0];
    assert.equal(rawComplex.type, 'complex-selector');
    if (rawComplex.type === 'complex-selector') {
      const firstCompound = rawComplex.items[0];
      assert.equal(firstCompound.type, 'compound-selector');
      if (firstCompound.type === 'compound-selector') {
        assert.equal(firstCompound.selectors[0].type, 'nesting-selector');
      }
    }

    // String input
    const strAst = parseSelectorAST('.btn:focus-visible, .btn:active');
    assert.ok(strAst);
    assert.equal(strAst.selectors.length, 2);
  });

  it('getDeclaredProperties indexes longhands, parent shorthands, and @supports features', () => {
    const css = [
      '.card {',
      '  border: 1px solid black;',
      '  padding: 12px 16px;',
      '  --custom-accent: #336699;',
      '}',
      '@supports (interpolate-size: allow-keywords) {',
      '  .anim { interpolate-size: allow-keywords; }',
      '}',
      '@supports not (backdrop-filter: blur(5px)) {',
      '  .fallback { opacity: 0.9; }',
      '}',
    ].join('\n');

    const sheet = parse(css);

    const props = getDeclaredProperties(sheet);
    assert.ok(props.has('border'));
    assert.ok(props.has('border-width'));
    assert.ok(props.has('border-style'));
    assert.ok(props.has('border-color'));
    assert.ok(props.has('padding'));
    assert.ok(props.has('padding-top'));
    assert.ok(props.has('--custom-accent'));
    assert.ok(props.has('interpolate-size'));
    assert.ok(props.has('backdrop-filter'));
    assert.ok(props.has('opacity'));

    const withoutSupports = getDeclaredProperties(sheet, { includeSupports: false });
    assert.ok(withoutSupports.has('border'));
    assert.ok(withoutSupports.has('interpolate-size'));
    assert.equal(withoutSupports.has('backdrop-filter'), false);
  });

  it('tokenizes @supports condition filtering selector() pseudo-functions and non-properties', () => {
    const css = '@supports selector(div:hover) and (interpolate-size: allow-keywords) and (--custom: 1) { .a { opacity: 1; } }';
    const sheet = parse(css);
    const props = getDeclaredProperties(sheet);
    assert.ok(props.has('interpolate-size'));
    assert.ok(props.has('--custom'));
    assert.ok(props.has('opacity'));
    assert.equal(props.has('div'), false);
    assert.equal(props.has('hover'), false);
  });

  it('computes 1-based line and column locations on both parse() and replaceSync() with CRLF newlines', () => {
    const css = '/* header */\r\n.first {\r\n  color: red;\r\n}\r\n.second {\r\n  color: blue;\r\n}';
    const sheet = parse(css);
    const [first, second] = getRules(sheet, CSSStyleRule);

    assert.equal(first.location?.line, 2);
    assert.equal(first.location?.column, 1);
    assert.equal(second.location?.line, 5);
    assert.equal(second.location?.column, 1);

    const constructed = new CSSStyleSheet();
    constructed.replaceSync(css);
    const [cFirst, cSecond] = getRules(constructed, CSSRule);
    assert.equal(cFirst.location?.line, 2);
    assert.equal(cFirst.location?.column, 1);
    assert.equal(cSecond.location?.line, 5);
    assert.equal(cSecond.location?.column, 1);
  });

  it('getPropertyValues returns same-rule fallbacks, logical/physical aliases, and var() shorthands', () => {
    const sheet = parse(`
      .subgrid {
        grid-template-rows: auto;
        grid-template-rows: subgrid;
      }
      .logical {
        margin-inline-start: 1rem;
        padding-block: 8px 16px;
      }
      .var-shorthand {
        border: 1px solid var(--border-color);
      }
    `);
    const [subgridRule, logicalRule, varRule] = getRules(sheet, CSSStyleRule);

    assert.deepEqual(getPropertyValues(subgridRule, 'grid-template-rows'), ['auto', 'subgrid']);
    assert.deepEqual(getPropertyValues(logicalRule, 'margin-left'), ['1rem']);
    assert.deepEqual(getPropertyValues(logicalRule, 'margin-inline-start'), ['1rem']);
    assert.deepEqual(getPropertyValues(logicalRule, 'padding-top'), ['8px']);
    assert.deepEqual(getPropertyValues(logicalRule, 'padding-bottom'), ['16px']);
    assert.deepEqual(getPropertyValues(logicalRule, 'margin-left', { logical: false }), []);
    assert.deepEqual(getPropertyValues(varRule, 'border-color'), ['1px solid var(--border-color)']);
    assert.deepEqual(getPropertyValues(varRule, 'border-top-color'), ['1px solid var(--border-color)']);
    assert.equal(getDeclaredProperties(sheet).has('border-color'), true);
  });

  it('rejects non-standard :global(...) and :local(...) selectors and supports allowUnknownPseudos opt-in', () => {
    const css = `
      form:tool-form-active { outline: 2px solid blue; }
      :global(.card) > .title { color: green; }
      :local(.card) > .title { color: red; }
    `;
    assert.equal(getRules(parse(css), CSSStyleRule).length, 0);
    assert.equal(parseSelectorAST(':global(.card)'), null);
    assert.equal(parseSelectorAST(':local(.card)'), null);

    const { document } = parseHTML('<div class="card"><h2 class="title">Hello</h2></div>');
    const titleEl = document.querySelector('.title');
    assert.equal(matches(titleEl, ':global(.title)'), false);
    assert.equal(matches(titleEl, ':local(.title)'), false);

    const sheet = parse('form:tool-form-active { outline: 2px solid blue; }', { allowUnknownPseudos: true });
    const rules = getRules(sheet, CSSStyleRule);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].selectorText, 'form:tool-form-active');

    const ast = parseSelectorAST(rules[0], { allowUnknownPseudos: true });
    assert.ok(ast);
  });

  it('parses @position-try into CSSPositionTryRule with CSSPositionTryDescriptors', () => {
    const sheet = parse(`
      @position-try --bottom-right {
        top: anchor(bottom);
        left: anchor(right);
        margin: 4px;
        position-area: bottom right;
        color: red;
        --disallowed: 1;
        width: 100px !important;
      }
    `);
    const rules = getRules(sheet, CSSPositionTryRule);
    assert.equal(rules.length, 1);
    const rule = rules[0];
    assert.equal(rule.name, '--bottom-right');
    assert.equal(rule.style instanceof CSSPositionTryDescriptors, true);
    assert.equal(rule.style.top, 'anchor(bottom)');
    assert.equal(rule.style.left, 'anchor(right)');
    assert.equal(rule.style.positionArea, 'bottom right');
    assert.equal(rule.style.getPropertyValue('color'), '');
    assert.equal(rule.style.getPropertyValue('--disallowed'), '');
    assert.equal(rule.style.getPropertyValue('width'), '');
  });

  it('getCascadedStyle accepts CSSStyleSheet directly and MediaEnvironment overrides', () => {
    const sheet = parse(`
      .box {
        width: 200px;
        transition: opacity 0.3s;
      }
      @media (max-width: 600px) {
        .box { width: 100px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .box { transition: none; }
      }
    `);
    const { document } = parseHTML('<div class="box"></div>');
    const box = document.querySelector('.box');

    const defaultStyle = getCascadedStyle(box, sheet);
    assert.equal(defaultStyle.getPropertyValue('width'), '200px');

    const mobileStyle = getCascadedStyle(box, sheet, { width: 480 });
    assert.equal(mobileStyle.getPropertyValue('width'), '100px');

    const reducedMotionStyle = getCascadedStyle(box, sheet, { prefersReducedMotion: 'reduce' });
    assert.equal(reducedMotionStyle.getPropertyValue('transition'), 'none');
  });
});
