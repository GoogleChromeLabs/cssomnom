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
import { CSSStyleSheet, MediaList } from '../src/index.ts';

describe('Constructable CSSStyleSheet', () => {
  test('new CSSStyleSheet()', () => {
    const sheet = new CSSStyleSheet();
    assert.strictEqual(sheet.cssRules.length, 0);
    assert.strictEqual(sheet.media.length, 0);
  });

  test('new CSSStyleSheet(options)', () => {
    const sheet = new CSSStyleSheet({
      media: 'screen',
      disabled: true
    });
    assert.strictEqual(sheet.media.mediaText, 'screen');
    assert.strictEqual(sheet.disabled, true);
  });

  test('new CSSStyleSheet(options with null)', () => {
    const sheet = new CSSStyleSheet({
      // @ts-expect-error media should not be nullable per spec
      media: null,
      // @ts-expect-error disabled should not be nullable per spec
      disabled: null,
      baseURL: null
    });
    assert.strictEqual(sheet.media.mediaText, '');
    assert.strictEqual(sheet.disabled, false);
  });

  test('sheet.replaceSync(text)', () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('div { color: red; }');
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'div { color: red; }');
  });

  test('sheet.replace(text)', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace('span { color: blue; }');
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'span { color: blue; }');
  });

  test('sheet.replace(text) executes asynchronously and updates rules', async () => {
    const sheet = new CSSStyleSheet();
    const promise = sheet.replace('p { color: green; }');
    assert.strictEqual(sheet.cssRules.length, 0, 'sheet should not have rules updated before promise resolution');
    await promise;
    assert.strictEqual(sheet.cssRules.length, 1);
    assert.strictEqual(sheet.cssRules[0].cssText, 'p { color: green; }');
  });

  test('sheet.replaceSync throws when modification is disallowed', () => {
    const sheet = new CSSStyleSheet();
    // Force set the private flag for testing
    (sheet as unknown as { _disallowModificationFlag: boolean })._disallowModificationFlag = true;
    assert.throws(() => {
      sheet.replaceSync('div { color: green; }');
    }, (err: unknown) => {
      return err instanceof DOMException && err.name === 'NotAllowedError';
    });
  });

  test('new CSSStyleSheet with MediaList always creates a new MediaList instance', () => {
    const mediaList = new MediaList('screen');
    const sheet = new CSSStyleSheet({ media: mediaList });
    
    assert.strictEqual(sheet.media.mediaText, 'screen');
    assert.notStrictEqual(sheet.media, mediaList);
    
    // Verify that modifying the original doesn't affect the sheet's media
    mediaList.appendMedium('print');
    assert.strictEqual(sheet.media.mediaText, 'screen');
    assert.strictEqual(mediaList.mediaText, 'screen, print');
  });
});

