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

  it('is non-enumerable on CSSRule to prevent leaking into standard object key enumerations', () => {
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
  });
});
