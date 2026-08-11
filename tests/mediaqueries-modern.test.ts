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
import { MediaParser } from '../src/MediaParser.ts';
import { MediaList, CSSCustomMediaRule } from '../src/CSSOM.ts';
import { parseStyleSheet } from '../src/parser.ts';
import { getCascadedStyle } from '../src/cascade.ts';
import type { MediaEnvironment } from '../src/types.ts';

describe('Media Queries Level 4/5 Range Syntax & Feature Evaluation', () => {
  const env: Partial<MediaEnvironment> = {
    mediaType: 'screen',
    width: 800,
    height: 600,
    deviceWidth: 1920,
    deviceHeight: 1080,
    aspectRatio: [800, 600], // 4/3 = 1.333
    orientation: 'landscape',
    resolution: 96, // 1dppx / 96dpi
    color: 8,
    colorIndex: 0,
    monochrome: 0,
    pointer: 'fine',
    hover: 'hover',
    prefersColorScheme: 'dark',
    prefersContrast: 'no-preference',
    prefersReducedMotion: 'reduce',
    scripting: 'enabled',
  };

  test('Prefix min-/max- features evaluation', () => {
    assert.strictEqual(MediaParser.evaluate('(min-width: 600px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(min-width: 900px)', env), false);
    assert.strictEqual(MediaParser.evaluate('(max-width: 800px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(max-width: 799px)', env), false);
  });

  test('Modern MQ4 comparison operators (<, <=, >, >=, =)', () => {
    assert.strictEqual(MediaParser.evaluate('(width > 600px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(width >= 800px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(width = 800px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(width <= 800px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(width < 800px)', env), false);
    assert.strictEqual(MediaParser.evaluate('(600px < width)', env), true);
    assert.strictEqual(MediaParser.evaluate('(800px <= width)', env), true);
  });

  test('Dual range queries (min <= feature <= max)', () => {
    assert.strictEqual(MediaParser.evaluate('(400px <= width <= 1000px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(1000px >= width >= 400px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(400px < width < 800px)', env), false);
    assert.strictEqual(MediaParser.evaluate('(800px <= width < 1200px)', env), true);
  });

  test('Ratio range & comparison evaluation', () => {
    // 800/600 = 4/3 (~1.3333)
    assert.strictEqual(MediaParser.evaluate('(aspect-ratio: 4/3)', env), true);
    assert.strictEqual(MediaParser.evaluate('(aspect-ratio: 16/9)', env), false);
    assert.strictEqual(MediaParser.evaluate('(aspect-ratio > 1/1)', env), true);
    assert.strictEqual(MediaParser.evaluate('(aspect-ratio < 2/1)', env), true);
    assert.strictEqual(MediaParser.evaluate('(1/1 <= aspect-ratio <= 16/9)', env), true);
    assert.strictEqual(MediaParser.evaluate('(1.33 <= aspect-ratio <= 1.34)', env), true);
  });

  test('Resolution conversions and comparisons', () => {
    // resolution = 96dpi = 1dppx
    assert.strictEqual(MediaParser.evaluate('(resolution: 96dpi)', env), true);
    assert.strictEqual(MediaParser.evaluate('(resolution: 1dppx)', env), true);
    assert.strictEqual(MediaParser.evaluate('(resolution: 1x)', env), true);
    assert.strictEqual(MediaParser.evaluate('(resolution: calc(1x))', env), true);
    assert.strictEqual(MediaParser.evaluate('(min-resolution: 90dpi)', env), true);
    assert.strictEqual(MediaParser.evaluate('(min-resolution: 2dppx)', env), false);
  });

  test('Unit conversions (em, rem, in, cm, mm, pt, pc, vw, vh)', () => {
    // 800px / 16px = 50em/rem
    assert.strictEqual(MediaParser.evaluate('(width: 50em)', env), true);
    assert.strictEqual(MediaParser.evaluate('(width: 50rem)', env), true);
    // 800px / 96px/in = 8.333in
    assert.strictEqual(MediaParser.evaluate('(width > 8in)', env), true);
    assert.strictEqual(MediaParser.evaluate('(width < 9in)', env), true);
    // 100vw = 800px
    assert.strictEqual(MediaParser.evaluate('(width: 100vw)', env), true);
    // 100vh = 600px
    assert.strictEqual(MediaParser.evaluate('(height: 100vh)', env), true);
  });

  test('Negative values in range features per MQ4 § 4.1', () => {
    assert.strictEqual(MediaParser.evaluate('(width = -10px)', env), false);
    assert.strictEqual(MediaParser.evaluate('(width < -10px)', env), false);
    assert.strictEqual(MediaParser.evaluate('(width <= -10px)', env), false);
    assert.strictEqual(MediaParser.evaluate('(width > -10px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(width >= -10px)', env), true);
  });

  test('Discrete and user-preference features', () => {
    assert.strictEqual(MediaParser.evaluate('(pointer: fine)', env), true);
    assert.strictEqual(MediaParser.evaluate('(pointer: coarse)', env), false);
    assert.strictEqual(MediaParser.evaluate('(hover: hover)', env), true);
    assert.strictEqual(MediaParser.evaluate('(hover: none)', env), false);
    assert.strictEqual(MediaParser.evaluate('(orientation: landscape)', env), true);
    assert.strictEqual(MediaParser.evaluate('(orientation: portrait)', env), false);
    assert.strictEqual(MediaParser.evaluate('(prefers-color-scheme: dark)', env), true);
    assert.strictEqual(MediaParser.evaluate('(prefers-color-scheme: light)', env), false);
    assert.strictEqual(MediaParser.evaluate('(prefers-reduced-motion: reduce)', env), true);
    assert.strictEqual(MediaParser.evaluate('(scripting: enabled)', env), true);
  });

  test('Boolean feature presence', () => {
    assert.strictEqual(MediaParser.evaluate('(color)', env), true);
    assert.strictEqual(MediaParser.evaluate('(monochrome)', env), false); // monochrome = 0
    assert.strictEqual(MediaParser.evaluate('(width)', env), true); // width = 800 > 0
  });

  test('Boolean logic: not, and, or, comma separation', () => {
    assert.strictEqual(MediaParser.evaluate('screen and (min-width: 600px)', env), true);
    assert.strictEqual(MediaParser.evaluate('print and (min-width: 600px)', env), false);
    assert.strictEqual(MediaParser.evaluate('not screen and (min-width: 600px)', env), false);
    assert.strictEqual(MediaParser.evaluate('print, screen and (min-width: 600px)', env), true);
    assert.strictEqual(MediaParser.evaluate('(min-width: 1000px) or (min-height: 500px)', env), true);
    assert.strictEqual(MediaParser.evaluate('not ((min-width: 1000px) or (max-height: 400px))', env), true);
  });
});

describe('CSSCustomMediaRule and Custom Media Evaluation', () => {
  test('Parses @custom-media rules', () => {
    const css = `
      @custom-media --narrow-window (max-width: 600px);
      @custom-media --wide true;
      @custom-media --unsupported false;
    `;
    const rules = parseStyleSheet(css);
    assert.strictEqual(rules.length, 3);

    const r1 = rules[0] as CSSCustomMediaRule;
    assert.strictEqual(r1.name, '--narrow-window');
    assert.strictEqual((r1.query as MediaList).mediaText, '(max-width: 600px)');
    assert.strictEqual(r1.cssText, '@custom-media --narrow-window (max-width: 600px);');

    const r2 = rules[1] as CSSCustomMediaRule;
    assert.strictEqual(r2.name, '--wide');
    assert.strictEqual(r2.query, true);
    assert.strictEqual(r2.cssText, '@custom-media --wide true;');

    const r3 = rules[2] as CSSCustomMediaRule;
    assert.strictEqual(r3.name, '--unsupported');
    assert.strictEqual(r3.query, false);
    assert.strictEqual(r3.cssText, '@custom-media --unsupported false;');
  });

  test('Evaluates custom media queries in MediaParser', () => {
    const customMediaMap = new Map<string, MediaList | boolean>();
    customMediaMap.set('--narrow-window', new MediaList('(max-width: 600px)'));
    customMediaMap.set('--always-true', true);
    customMediaMap.set('--always-false', false);

    const env: Partial<MediaEnvironment> = {
      width: 800,
      customMedia: customMediaMap,
    };

    assert.strictEqual(MediaParser.evaluate('(--always-true)', env), true);
    assert.strictEqual(MediaParser.evaluate('(--always-false)', env), false);
    assert.strictEqual(MediaParser.evaluate('(--narrow-window)', env), false);
    assert.strictEqual(MediaParser.evaluate('(--narrow-window) or (--always-true)', env), true);
  });
});

describe('MediaList CSSOM Interface Conformance', () => {
  test('Initializes with mediaText and parses query items', () => {
    const list = new MediaList('screen, print and (min-width: 600px)');
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list.item(0), 'screen');
    assert.strictEqual(list.item(1), 'print and (min-width: 600px)');
    assert.strictEqual(list.mediaText, 'screen, print and (min-width: 600px)');
  });

  test('Appends and deletes mediums', () => {
    const list = new MediaList('screen');
    assert.strictEqual(list.length, 1);

    list.appendMedium('print');
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list.item(1), 'print');
    assert.strictEqual(list.mediaText, 'screen, print');

    // Appending existing medium does not duplicate
    list.appendMedium('screen');
    assert.strictEqual(list.length, 2);

    // Deleting medium
    list.deleteMedium('screen');
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list.item(0), 'print');
    assert.strictEqual(list.mediaText, 'print');

    // Deleting non-existent medium throws NotFoundError (CSSOM 1 § 6.2)
    assert.throws(() => {
      list.deleteMedium('handheld');
    }, /NotFoundError/);
  });

  test('Setting mediaText resets the list', () => {
    const list = new MediaList('screen');
    list.mediaText = 'all and (min-width: 800px)';
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list.mediaText, '(min-width: 800px)');
  });
});

describe('Cascade Engine Rule Filtering with @media', () => {
  test('Applies styles only when @media condition matches', () => {
    const css = `
      .box { color: red; }
      @media (min-width: 1000px) {
        .box { color: green; }
      }
      @media (max-width: 900px) {
        .box { color: blue; }
      }
    `;
    const rules = parseStyleSheet(css);
    const mockEl = {
      tagName: 'div',
      className: 'box',
      ownerDocument: null,
    };

    const style = getCascadedStyle(mockEl, rules);
    // Standard DEFAULT_MEDIA_ENV width is 800px, so min-width: 1000px is false, max-width: 900px is true
    assert.strictEqual(style.getPropertyValue('color'), 'rgb(0, 0, 255)');
  });
});
