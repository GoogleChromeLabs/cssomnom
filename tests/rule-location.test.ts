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
  CSSStyleRule,
  CSSMediaRule,
  CSSKeyframesRule,
  CSSFontFaceRule,
} from '../src/index.ts';

describe('CSSRule.prototype.location: Source position tracking', () => {
  it('tracks character offsets on simple style rules', () => {
    const css = '/* comment */\n.btn { color: red; }';
    const sheet = parse(css);
    assert.equal(sheet.cssRules.length, 1);
    const rule = sheet.cssRules[0] as CSSStyleRule;
    assert.ok(rule.location);
    assert.equal(rule.location.start, 14);
    assert.equal(rule.location.end, 34);
    assert.equal(rule.location.bodyStart, 20);
    assert.equal(rule.location.bodyEnd, 33);
    assert.equal(css.slice(rule.location.start, rule.location.end), '.btn { color: red; }');
    assert.equal(css.slice(rule.location.bodyStart, rule.location.bodyEnd), ' color: red; ');
  });

  it('tracks character offsets on grouping at-rules and their children', () => {
    const css = '@media (min-width: 600px) {\n  .container { width: 100%; }\n}';
    const sheet = parse(css);
    assert.equal(sheet.cssRules.length, 1);
    const mediaRule = sheet.cssRules[0] as CSSMediaRule;
    assert.ok(mediaRule.location);
    assert.equal(css.slice(mediaRule.location.start, mediaRule.location.end), css);
    
    assert.equal(mediaRule.cssRules.length, 1);
    const child = mediaRule.cssRules[0] as CSSStyleRule;
    assert.ok(child.location);
    assert.equal(css.slice(child.location.start, child.location.end), '.container { width: 100%; }');
  });

  it('tracks character offsets on nested style rules', () => {
    const css = '.card {\n  padding: 10px;\n  & .title {\n    font-size: 16px;\n  }\n}';
    const sheet = parse(css);
    const root = sheet.cssRules[0] as CSSStyleRule;
    assert.ok(root.location);
    assert.equal(css.slice(root.location.start, root.location.end), css);

    const nested = root.cssRules[0] as CSSStyleRule;
    assert.ok(nested.location);
    assert.equal(css.slice(nested.location.start, nested.location.end), '& .title {\n    font-size: 16px;\n  }');
  });

  it('tracks character offsets on keyframes and individual keyframe rules', () => {
    const css = '@keyframes slide {\n  0% { transform: none; }\n  100% { transform: translateY(10px); }\n}';
    const sheet = parse(css);
    const kf = sheet.cssRules[0] as CSSKeyframesRule;
    assert.ok(kf.location);
    assert.equal(css.slice(kf.location.start, kf.location.end), css);

    assert.equal(kf.cssRules.length, 2);
    assert.equal(css.slice(kf.cssRules[0].location!.start, kf.cssRules[0].location!.end), '0% { transform: none; }');
    assert.equal(css.slice(kf.cssRules[1].location!.start, kf.cssRules[1].location!.end), '100% { transform: translateY(10px); }');
  });

  it('tracks character offsets on specialized at-rules (@font-face, @property)', () => {
    const css = '@font-face {\n  font-family: MyFont;\n  src: url(font.woff2);\n}\n@property --val {\n  syntax: "<integer>";\n  inherits: false;\n  initial-value: 0;\n}';
    const sheet = parse(css);
    assert.equal(sheet.cssRules.length, 2);
    const ff = sheet.cssRules[0] as CSSFontFaceRule;
    assert.ok(ff.location);
    assert.ok(css.slice(ff.location.start, ff.location.end).startsWith('@font-face'));

    const prop = sheet.cssRules[1];
    assert.ok(prop.location);
    assert.ok(css.slice(prop.location.start, prop.location.end).startsWith('@property'));
  });

  it('is non-enumerable and strictly read-only on CSSRule', () => {
    const sheet = parse('.test { color: blue; }');
    const rule = sheet.cssRules[0];
    const keys = Object.keys(rule);
    assert.ok(!keys.includes('location'), 'location should not appear in Object.keys()');
    
    let foundInForIn = false;
    for (const k in rule) {
      if (k === 'location') foundInForIn = true;
    }
    assert.ok(!foundInForIn, 'location should not be enumerable in for...in');
    assert.ok(rule.location !== undefined, 'rule.location is accessible via prototype getter');

    // Strictly read-only: attempting assignment must throw TypeError
    assert.throws(() => {
      // @ts-expect-error - testing runtime immutability
      rule.location = { start: 0, end: 10 };
    }, TypeError);
  });

  it('tracks character offsets on attribute selectors and pseudo-classes with blocks', () => {
    // Attribute selector starting at index 0 (SimpleBlock as prelude[0])
    const css1 = '[data-active] { color: red; }';
    const sheet1 = parse(css1);
    assert.equal(sheet1.cssRules.length, 1);
    const rule1 = sheet1.cssRules[0] as CSSStyleRule;
    assert.ok(rule1.location);
    assert.equal(rule1.location.start, 0);
    assert.equal(rule1.location.end, 29);
    assert.equal(rule1.location.bodyStart, 15);
    assert.equal(rule1.location.bodyEnd, 28);
    assert.equal(css1.slice(rule1.location.start, rule1.location.end), '[data-active] { color: red; }');
    assert.equal(css1.slice(rule1.location.bodyStart, rule1.location.bodyEnd), ' color: red; ');

    // Nested attribute selector
    const css2 = '.card {\n  [data-active] { color: blue; }\n}';
    const sheet2 = parse(css2);
    const root2 = sheet2.cssRules[0] as CSSStyleRule;
    const nested2 = root2.cssRules[0] as CSSStyleRule;
    assert.ok(nested2.location);
    assert.equal(css2.slice(nested2.location.start, nested2.location.end), '[data-active] { color: blue; }');
    assert.equal(css2.slice(nested2.location.bodyStart, nested2.location.bodyEnd), ' color: blue; ');

    // Functional pseudo-class :is(...)
    const css3 = ':is(.btn, .link) { color: green; }';
    const sheet3 = parse(css3);
    const rule3 = sheet3.cssRules[0] as CSSStyleRule;
    assert.ok(rule3.location);
    assert.equal(rule3.location.start, 0);
    assert.equal(rule3.location.end, 34);
    assert.equal(rule3.location.bodyStart, 18);
    assert.equal(rule3.location.bodyEnd, 33);
    assert.equal(css3.slice(rule3.location.start, rule3.location.end), ':is(.btn, .link) { color: green; }');
    assert.equal(css3.slice(rule3.location.bodyStart, rule3.location.bodyEnd), ' color: green; ');

    // Functional pseudo-class with attribute selector inside :not([disabled])
    const css4 = ':not([disabled]) { cursor: pointer; }';
    const sheet4 = parse(css4);
    const rule4 = sheet4.cssRules[0] as CSSStyleRule;
    assert.ok(rule4.location);
    assert.equal(rule4.location.start, 0);
    assert.equal(css4.slice(rule4.location.start, rule4.location.end), ':not([disabled]) { cursor: pointer; }');
    assert.equal(css4.slice(rule4.location.bodyStart, rule4.location.bodyEnd), ' cursor: pointer; ');
  });

  it('accurately tracks source bounds and body ranges on unclosed rules at EOF without clipping', () => {
    // Style rule unclosed at EOF without closing '}'
    const css1 = '.alert { color: red';
    const sheet1 = parse(css1);
    assert.equal(sheet1.cssRules.length, 1);
    const rule1 = sheet1.cssRules[0] as CSSStyleRule;
    assert.ok(rule1.location);
    assert.equal(rule1.location.start, 0);
    assert.equal(rule1.location.end, css1.length);
    assert.equal(rule1.location.bodyStart, 8);
    assert.equal(rule1.location.bodyEnd, css1.length);
    assert.equal(css1.slice(rule1.location.start, rule1.location.end), '.alert { color: red');
    assert.equal(css1.slice(rule1.location.bodyStart, rule1.location.bodyEnd), ' color: red');

    // Nested style rule unclosed at EOF
    const css2 = '.parent { .child { color: red';
    const sheet2 = parse(css2);
    const root2 = sheet2.cssRules[0] as CSSStyleRule;
    assert.ok(root2.location);
    assert.equal(root2.location.end, css2.length);
    assert.equal(root2.location.bodyEnd, css2.length);
    const child2 = root2.cssRules[0] as CSSStyleRule;
    assert.ok(child2.location);
    assert.equal(child2.location.start, 10);
    assert.equal(child2.location.end, css2.length);
    assert.equal(child2.location.bodyStart, 18);
    assert.equal(child2.location.bodyEnd, css2.length);
    assert.equal(css2.slice(child2.location.bodyStart, child2.location.bodyEnd), ' color: red');

    // At-rule unclosed at EOF: inner closing brace must not be clipped off
    const css3 = '@media (min-width: 500px) { .alert { color: red; }';
    const sheet3 = parse(css3);
    const media3 = sheet3.cssRules[0] as CSSMediaRule;
    assert.ok(media3.location);
    assert.equal(media3.location.start, 0);
    assert.equal(media3.location.end, css3.length);
    assert.equal(media3.location.bodyEnd, css3.length);
    assert.equal(css3.slice(media3.location.start, media3.location.end), css3);
    assert.equal(css3.slice(media3.location.bodyStart, media3.location.bodyEnd), ' .alert { color: red; }');

    // Keyframe unclosed at EOF: last character must not be clipped off
    const css4 = '@keyframes anim { from { opacity: 0; } to { opacity: 1';
    const sheet4 = parse(css4);
    const kf4 = sheet4.cssRules[0] as CSSKeyframesRule;
    assert.ok(kf4.location);
    assert.equal(kf4.location.end, css4.length);
    assert.equal(kf4.location.bodyEnd, css4.length);
    const toRule = kf4.cssRules[1];
    assert.ok(toRule.location);
    assert.equal(toRule.location.end, css4.length);
    assert.equal(toRule.location.bodyEnd, css4.length);
    assert.equal(css4.slice(toRule.location.bodyStart, toRule.location.bodyEnd), ' opacity: 1');
  });
});
