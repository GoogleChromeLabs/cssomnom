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
import assert from 'node:assert';
import { CSSStyleSheet, CSSStyleRule } from '../src/index.ts';
import type { Rule } from '../src/types.ts';

describe('CSSStyleSheet Constructed Restrictions', () => {
  it('should throw SyntaxError when inserting @import into a constructed stylesheet', () => {
    const sheet = new CSSStyleSheet(); // Constructed by default if no args or options passed? 
    // Wait, let's check the constructor.
    // 451:   constructor(rulesOrOptions?: Rule[] | CSSStyleSheetInit, parseRuleOrNothing?: (text: string) => Rule) {
    // 459:       this._constructedFlag = true;
    
    assert.throws(() => {
      sheet.insertRule('@import url("foo.css");', 0);
    }, (err: unknown) => {
      return (err as Error).name === 'SyntaxError';
    });
  });

  it('should allow inserting @import into a non-constructed stylesheet', () => {
    const sheet = CSSStyleSheet.createInternal([], (_t: string) => ({ type: 'at-rule', name: 'import', prelude: [] } as unknown as Rule));
    // This is a non-constructed stylesheet because we passed an array.
    // Wait, the constructor logic for non-constructed:
    // 452:     if (Array.isArray(rulesOrOptions)) {
    // 453:       this._rules = rulesOrOptions;
    
    // It doesn't throw.
    sheet.insertRule('@import url("foo.css");', 0);
    assert.strictEqual(sheet.cssRules.length, 1);
  });

  it('should filter out @import rules in replaceSync', () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('@import url("foo.css"); .a { color: red; }');
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual((sheet.cssRules[0] as unknown as CSSStyleRule).selectorText, '.a');
  });

  it('should throw InvalidStateError when inserting @namespace after regular rules', () => {
    const sheet = CSSStyleSheet.createInternal([], (t: string) => {
      if (t.startsWith('@namespace')) return { type: 'at-rule', name: 'namespace', prelude: [] } as unknown as Rule;
      return { type: 'style-rule', selectorText: '.a', style: { declarations: [] } } as unknown as CSSStyleRule;
    });
    sheet.insertRule('.a { color: red; }', 0);
    
    assert.throws(() => {
      sheet.insertRule('@namespace url("http://www.w3.org/1999/xhtml");', 0);
    }, (err: unknown) => {
      return (err as Error).name === 'InvalidStateError';
    });
  });

  it('should ignore setProperty with invalid priority', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.a { }', 0);
    const style = (sheet.cssRules[0] as unknown as CSSStyleRule).style;
    
    style.setProperty('color', 'red', 'invalid');
    assert.strictEqual(style.getPropertyValue('color'), '');
    
    style.setProperty('color', 'blue', 'important');
    assert.strictEqual(style.getPropertyValue('color'), 'blue');
    assert.strictEqual(style.getPropertyPriority('color'), 'important');
  });

  it('should return correct shorthand value in removeProperty', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.a { margin: 10px 20px; }', 0);
    const style = (sheet.cssRules[0] as unknown as CSSStyleRule).style;
    
    const removed = style.removeProperty('margin');
    assert.strictEqual(removed, '10px 20px');
    assert.strictEqual(style.getPropertyValue('margin-top'), '');
  });

  it('should return correct value in removeProperty(\'all\') when explicitly set', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.a { all: unset; }', 0);
    const style = (sheet.cssRules[0] as unknown as CSSStyleRule).style;
    
    const removed = style.removeProperty('all');
    assert.strictEqual(removed, 'unset');
    assert.strictEqual(style.getPropertyValue('all'), '');
  });

  it('should return empty string in removeProperty(\'all\') when not explicitly set', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.a { color: red; }', 0);
    const style = (sheet.cssRules[0] as unknown as CSSStyleRule).style;
    
    const removed = style.removeProperty('all');
    assert.strictEqual(removed, '');
    assert.strictEqual(style.getPropertyValue('color'), '');
  });

  it('should ignore setProperty for unsupported properties', () => {
    const sheet = new CSSStyleSheet();
    sheet.insertRule('.a { }', 0);
    const style = (sheet.cssRules[0] as unknown as CSSStyleRule).style;
    
    style.setProperty('invalid-property-name', 'value');
    assert.strictEqual(style.getPropertyValue('invalid-property-name'), '');
    assert.strictEqual(style.length, 0);
  });
});
