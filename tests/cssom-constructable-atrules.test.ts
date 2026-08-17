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
import {
  CSSStyleSheet,
  MediaList,
  CSSPageRule,
  CSSContainerRule,
  CSSMediaRule,
  CSSConditionRule,
} from '../src/index.ts';
import { parseRule } from '../src/parser.ts';

describe('Constructable CSSStyleSheet & adoptedStyleSheets Guards (CSSOM § 6.5 & § 7.3)', () => {
  test('CSSStyleSheet constructor with valid and invalid baseURL', () => {
    const sheetValid = new CSSStyleSheet({ baseURL: 'https://example.com/styles/' });
    assert.strictEqual(sheetValid._baseURL, 'https://example.com/styles/');

    // Invalid baseURL throws NotAllowedError DOMException
    assert.throws(() => {
      new CSSStyleSheet({ baseURL: 'https://test:test/' });
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'NotAllowedError';
    });
  });

  test('replace and replaceSync throw NotAllowedError on non-constructed stylesheets', async () => {
    const regularSheet = CSSStyleSheet.createInternal([], () => {
      throw new Error('not implemented');
    });
    assert.strictEqual(regularSheet._constructed, false);

    assert.throws(() => {
      regularSheet.replaceSync('div { color: red; }');
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'NotAllowedError';
    });

    await assert.rejects(async () => {
      await regularSheet.replace('div { color: red; }');
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'NotAllowedError';
    });
  });

  test('replace and replaceSync succeed on constructed stylesheets', async () => {
    const sheet = new CSSStyleSheet();
    assert.strictEqual(sheet._constructed, true);

    sheet.replaceSync('div { color: red; }');
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'div { color: red; }');

    await sheet.replace('span { color: blue; }');
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'span { color: blue; }');
  });
});

describe('CSSPageRule & CSSContainerRule Descriptors (CSSOM § 6.4.5 & CSS Contain 3)', () => {
  test('CSSPageRule selectorText normalization and validation', () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('@page {}');
    const rule = sheet.cssRules[0] as CSSPageRule;
    assert.ok(rule instanceof CSSPageRule);
    assert.strictEqual(rule.selectorText, '');
    assert.strictEqual(rule.cssText, '@page { }');

    rule.selectorText = ':left';
    assert.strictEqual(rule.selectorText, ':left');
    assert.strictEqual(rule.cssText, '@page :left { }');

    rule.selectorText = 'named';
    assert.strictEqual(rule.selectorText, 'named');
    assert.strictEqual(rule.cssText, '@page named { }');

    rule.selectorText = 'named:first';
    assert.strictEqual(rule.selectorText, 'named:first');
    assert.strictEqual(rule.cssText, '@page named:first { }');

    // Case-insensitivity: pseudo-page names are lowercased
    rule.selectorText = 'named:First';
    assert.strictEqual(rule.selectorText, 'named:first');
    assert.strictEqual(rule.cssText, '@page named:first { }');

    // Multiple pseudo-pages
    rule.selectorText = 'named:first:left:right:first';
    assert.strictEqual(rule.selectorText, 'named:first:left:right:first');
    assert.strictEqual(rule.cssText, '@page named:first:left:right:first { }');

    // Reject whitespace between ident and pseudo
    rule.selectorText = '';
    rule.selectorText = 'named :first';
    assert.strictEqual(rule.selectorText, '');

    // Reject whitespace between pseudos
    rule.selectorText = ':first :left';
    assert.strictEqual(rule.selectorText, '');

    // Reject invalid pseudo
    rule.selectorText = ':notapagepseudo';
    assert.strictEqual(rule.selectorText, '');
  });

  test('CSSContainerRule containerName and containerQuery descriptors', () => {
    const rule1 = parseRule('@container name (min-width: 100px) {}') as CSSContainerRule;
    assert.ok(rule1 instanceof CSSContainerRule);
    assert.strictEqual(rule1.containerName, 'name');
    assert.strictEqual(rule1.containerQuery, '(min-width: 100px)');
    assert.strictEqual(rule1.conditionText, 'name (min-width: 100px)');

    const rule2 = parseRule('@container (min-width: 100px) {}') as CSSContainerRule;
    assert.ok(rule2 instanceof CSSContainerRule);
    assert.strictEqual(rule2.containerName, '');
    assert.strictEqual(rule2.containerQuery, '(min-width: 100px)');
    assert.strictEqual(rule2.conditionText, '(min-width: 100px)');

    const rule3 = parseRule('@container not (min-width: 100px) {}') as CSSContainerRule;
    assert.ok(rule3 instanceof CSSContainerRule);
    assert.strictEqual(rule3.containerName, '');
    assert.strictEqual(rule3.containerQuery, 'not (min-width: 100px)');
    assert.strictEqual(rule3.conditionText, 'not (min-width: 100px)');

    const rule4 = parseRule('@container my-card (width > 300px) {}') as CSSContainerRule;
    assert.ok(rule4 instanceof CSSContainerRule);
    assert.strictEqual(rule4.containerName, 'my-card');
    assert.strictEqual(rule4.containerQuery, '(width > 300px)');
    assert.strictEqual(rule4.conditionText, 'my-card (width > 300px)');
  });
});

describe('MediaList WebIDL Algorithms & CSSConditionRule (CSSOM § 6.2 & CSS Conditional 3)', () => {
  test('MediaList deleteMedium argument requirements and error handling', () => {
    const mediaList = new MediaList('all');

    // 0 arguments throws TypeError
    assert.throws(() => {
      // @ts-expect-error testing 0 arguments
      mediaList.deleteMedium();
    }, (err: unknown) => {
      return err instanceof TypeError;
    });

    // Deleting non-existent medium throws NotFoundError DOMException
    assert.throws(() => {
      mediaList.deleteMedium('screen');
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'NotFoundError';
    });

    // Deleting existent medium succeeds
    mediaList.deleteMedium('all');
    assert.strictEqual(mediaList.length, 0);
    assert.strictEqual(mediaList.mediaText, '');
  });

  test('MediaList preserves explicit all medium in serialization', () => {
    const mediaList = new MediaList('all');
    assert.strictEqual(mediaList.mediaText, 'all');

    mediaList.appendMedium('screen');
    assert.strictEqual(mediaList.mediaText, 'all, screen');

    mediaList.deleteMedium('all');
    assert.strictEqual(mediaList.mediaText, 'screen');
  });

  test('CSSConditionRule conditionText is readonly attribute per WebIDL', () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('@media not all { :root { color: lime; } }');
    const rule = sheet.cssRules[0] as CSSMediaRule;
    assert.ok(rule instanceof CSSConditionRule);
    assert.strictEqual(rule.conditionText, 'not all');

    // Setting conditionText should throw in strict mode (or be ignored)
    assert.throws(() => {
      // @ts-expect-error conditionText is readonly
      rule.conditionText = 'all';
    }, TypeError);
    assert.strictEqual(rule.conditionText, 'not all');
  });
});
