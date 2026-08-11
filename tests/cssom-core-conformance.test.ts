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
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule, CSSMediaRule } from '../src/CSSOM.ts';
import { CSSStyleDeclaration } from '../src/CSSStyleDeclaration.ts';

describe('CSSOM Core Conformance - Index Boundaries & Hierarchy Validation', () => {
  test('insertRule validates index bounds BEFORE parsing syntax (CSSOM 1 § 6.5.3 #insert-a-css-rule)', () => {
    const parser = new Parser([]);
    const sheet = parser.parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 0);

    // Out of bounds index with invalid CSS syntax MUST throw IndexSizeError, NOT SyntaxError
    assert.throws(() => {
      sheet.insertRule('??? invalid syntax ???', 2);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });

    assert.throws(() => {
      sheet.insertRule('??? invalid syntax ???', -1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });

    // In-bounds index with invalid CSS syntax throws SyntaxError
    assert.throws(() => {
      sheet.insertRule('??? invalid syntax ???', 0);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'SyntaxError';
    });
  });

  test('CSSGroupingRule.insertRule validates index bounds BEFORE parsing (CSSOM 1 § 6.5.3 #insert-a-css-rule)', () => {
    const sheet = new Parser(tokenize('@media all { * {} }')).parseStyleSheet();
    const mediaRule = sheet.cssRules[0] as CSSMediaRule;
    assert.strictEqual(mediaRule.cssRules.length, 1);

    // Index 2 on length 1 with invalid syntax must throw IndexSizeError
    assert.throws(() => {
      mediaRule.insertRule('??? invalid syntax ???', 2);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });

    assert.throws(() => {
      mediaRule.insertRule('??? invalid syntax ???', -1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });
  });

  test('CSSGroupingRule.insertRule throws HierarchyRequestError for @import and @namespace (CSSOM 1 § 6.5.3 #insert-a-css-rule)', () => {
    const sheet = new Parser(tokenize('@media all { * {} }')).parseStyleSheet();
    const mediaRule = sheet.cssRules[0] as CSSMediaRule;

    assert.throws(() => {
      mediaRule.insertRule('@import url("foo.css");', 0);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'HierarchyRequestError';
    });

    assert.throws(() => {
      mediaRule.insertRule('@namespace url(http://www.w3.org/1999/xhtml);', 0);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'HierarchyRequestError';
    });
  });

  test('deleteRule index boundary checks (CSSOM 1 § 6.5.4 #remove-a-css-rule)', () => {
    const sheet = new Parser(tokenize('.foo { color: red; }')).parseStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 1);

    assert.throws(() => {
      sheet.deleteRule(1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });

    assert.throws(() => {
      sheet.deleteRule(-1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });

    const styleRule = sheet.cssRules[0] as CSSStyleRule;
    styleRule.insertRule('div { color: blue; }', 0);
    assert.strictEqual(styleRule.cssRules.length, 1);

    assert.throws(() => {
      styleRule.deleteRule(1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });

    assert.throws(() => {
      styleRule.deleteRule(-1);
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'IndexSizeError';
    });
  });

  test('parentStyleSheet and parentRule back-references on insertion and deletion (CSSOM 1 § 6.4 #the-cssrule-interface)', () => {
    const sheet = new Parser([]).parseStyleSheet();
    sheet.insertRule('@media all { .inner { color: red; } }', 0);

    const mediaRule = sheet.cssRules[0] as CSSMediaRule;
    assert.strictEqual(mediaRule.parentStyleSheet, sheet);
    assert.strictEqual(mediaRule.parentRule, null);

    const innerRule = mediaRule.cssRules[0] as CSSStyleRule;
    assert.strictEqual(innerRule.parentRule, mediaRule);
    assert.strictEqual(innerRule.parentStyleSheet, sheet);
    assert.strictEqual(innerRule.style.parentRule, innerRule);

    // Insert a new nested rule
    mediaRule.insertRule('.nested { color: green; }', 1);
    const nestedRule = mediaRule.cssRules[1] as CSSStyleRule;
    assert.strictEqual(nestedRule.parentRule, mediaRule);
    assert.strictEqual(nestedRule.parentStyleSheet, sheet);

    // Delete nested rule
    mediaRule.deleteRule(1);
    assert.strictEqual(nestedRule.parentRule, null);
    assert.strictEqual(nestedRule.parentStyleSheet, null);

    // Delete top-level rule
    sheet.deleteRule(0);
    assert.strictEqual(mediaRule.parentStyleSheet, null);
    assert.strictEqual(mediaRule.parentRule, null);
  });
});

describe('CSSStyleDeclaration Priority & Canonical Serialization', () => {
  test('setProperty case-insensitive important priority (CSSOM 1 § 6.7.1 #the-cssstyledeclaration-interface)', () => {
    const decl = new CSSStyleDeclaration();
    decl.setProperty('color', 'red', 'ImPoRtAnt');
    assert.strictEqual(decl.getPropertyValue('color'), 'red');
    assert.strictEqual(decl.getPropertyPriority('color'), 'important');

    decl.setProperty('background-color', 'blue', '  IMPORTANT  ');
    assert.strictEqual(decl.getPropertyValue('background-color'), 'blue');
    assert.strictEqual(decl.getPropertyPriority('background-color'), 'important');

    decl.setProperty('margin', '10px', 'important');
    assert.strictEqual(decl.getPropertyPriority('margin'), 'important');
    assert.strictEqual(decl.getPropertyPriority('margin-top'), 'important');
  });

  test('setProperty rejects invalid priority strings (CSSOM 1 § 6.7.1 #the-cssstyledeclaration-interface)', () => {
    const decl = new CSSStyleDeclaration();
    decl.setProperty('color', 'red');
    assert.strictEqual(decl.getPropertyValue('color'), 'red');
    assert.strictEqual(decl.getPropertyPriority('color'), '');

    // Invalid priority strings must be rejected (no modification)
    decl.setProperty('color', 'blue', '!important');
    assert.strictEqual(decl.getPropertyValue('color'), 'red');
    assert.strictEqual(decl.getPropertyPriority('color'), '');

    decl.setProperty('color', 'green', 'invalid');
    assert.strictEqual(decl.getPropertyValue('color'), 'red');
    assert.strictEqual(decl.getPropertyPriority('color'), '');

    decl.setProperty('font-size', '16px', 'custom-prio');
    assert.strictEqual(decl.getPropertyValue('font-size'), '');
  });

  test('setProperty accepts null and undefined priority as empty string (CSSOM 1 § 6.7.1 #the-cssstyledeclaration-interface)', () => {
    const decl = new CSSStyleDeclaration();
    decl.setProperty('color', 'red', 'important');
    assert.strictEqual(decl.getPropertyPriority('color'), 'important');

    // Setting with undefined priority resets priority to ""
    decl.setProperty('color', 'green', undefined);
    assert.strictEqual(decl.getPropertyValue('color'), 'green');
    assert.strictEqual(decl.getPropertyPriority('color'), '');

    decl.setProperty('color', 'blue', 'important');
    assert.strictEqual(decl.getPropertyPriority('color'), 'important');

    // Setting with null priority resets priority to ""
    // @ts-expect-error testing runtime null
    decl.setProperty('color', 'blue', null);
    assert.strictEqual(decl.getPropertyValue('color'), 'blue');
    assert.strictEqual(decl.getPropertyPriority('color'), '');
  });

  test('getPropertyPriority always returns lowercase "important" or "" (CSSOM 1 § 6.7.1 #the-cssstyledeclaration-interface)', () => {
    const decl = new CSSStyleDeclaration();
    decl.setProperty('color', 'red', 'IMPORTANT');
    assert.strictEqual(decl.getPropertyPriority('color'), 'important');
    assert.strictEqual(decl.getPropertyPriority('nonexistent'), '');
  });
});
