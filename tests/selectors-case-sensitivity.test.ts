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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { matches, querySelector, toAsciiLowerCase } from '../src/matcher.ts';
import { runWptFile } from '../scripts/wpt/node/run.ts';
import path from 'node:path';
import * as fs from 'node:fs';

test('toAsciiLowerCase only folds ASCII A-Z', () => {
  assert.strictEqual(toAsciiLowerCase('DIV'), 'div');
  assert.strictEqual(toAsciiLowerCase('DiV'), 'div');
  assert.strictEqual(toAsciiLowerCase('div'), 'div');
  assert.strictEqual(toAsciiLowerCase('Hello-World_123'), 'hello-world_123');

  // Unicode Kelvin sign \u212A (U+212A -> 'K')
  assert.strictEqual(toAsciiLowerCase('\u212A'), '\u212A');
  assert.notStrictEqual(toAsciiLowerCase('\u212A'), 'k');
  assert.notStrictEqual(toAsciiLowerCase('\u212A'), 'K');

  // Non-ASCII Greek uppercase Omega \u03A9 ('Ω')
  assert.strictEqual(toAsciiLowerCase('\u03A9'), '\u03A9');
  assert.notStrictEqual(toAsciiLowerCase('\u03A9'), '\u03C9'); // 'ω'

  // Non-ASCII Cyrillic uppercase De \u0414 ('Д')
  assert.strictEqual(toAsciiLowerCase('\u0414'), '\u0414');
  assert.notStrictEqual(toAsciiLowerCase('\u0414'), '\u0434'); // 'д'

  // Turkish dotted uppercase I \u0130 ('İ')
  assert.strictEqual(toAsciiLowerCase('\u0130'), '\u0130');
  assert.notStrictEqual(toAsciiLowerCase('\u0130'), 'i');
});

test('Selectors 4 § 3.2: Tag / Element Type matching case-sensitivity', () => {
  const { document } = parseHTML('<div></div>');
  const div = document.querySelector('div')!;

  // Standard ASCII elements: <div> matches DIV, div, DiV
  assert.strictEqual(matches(div, 'div'), true);
  assert.strictEqual(matches(div, 'DIV'), true);
  assert.strictEqual(matches(div, 'DiV'), true);
  assert.strictEqual(querySelector(document, 'DIV'), div);
  assert.strictEqual(querySelector(document, 'div'), div);

  // Unicode Kelvin sign element <\u212A>
  const kelvinEl = document.createElement('\u212A');
  document.body.appendChild(kelvinEl);
  assert.strictEqual(matches(kelvinEl, '\u212A'), true);
  assert.strictEqual(matches(kelvinEl, '\\212A'), true);
  assert.strictEqual(matches(kelvinEl, 'k'), false);
  assert.strictEqual(matches(kelvinEl, 'K'), false);
  assert.strictEqual(querySelector(document, 'k'), null);
  assert.strictEqual(querySelector(document, 'K'), null);
  assert.strictEqual(querySelector(document, '\\212A'), kelvinEl);

  // Greek uppercase element <\u03A9> ('<Ω>')
  const omegaEl = document.createElement('\u03A9');
  document.body.appendChild(omegaEl);
  assert.strictEqual(matches(omegaEl, '\u03A9'), true);
  assert.strictEqual(matches(omegaEl, '\\3A9'), true);
  assert.strictEqual(matches(omegaEl, '\u03C9'), false); // 'ω'
  assert.strictEqual(matches(omegaEl, '\\3C9'), false);
  assert.strictEqual(querySelector(document, '\u03C9'), null);
  assert.strictEqual(querySelector(document, '\\3A9'), omegaEl);

  // Cyrillic uppercase element <\u0414> ('<Д>')
  const deEl = document.createElement('\u0414');
  document.body.appendChild(deEl);
  assert.strictEqual(matches(deEl, '\u0414'), true);
  assert.strictEqual(matches(deEl, '\\414'), true);
  assert.strictEqual(matches(deEl, '\u0434'), false); // 'д'
  assert.strictEqual(matches(deEl, '\\434'), false);
  assert.strictEqual(querySelector(document, '\u0434'), null);
  assert.strictEqual(querySelector(document, '\\414'), deEl);

  // Turkish uppercase dotted I <\u0130> ('<İ>')
  const turkishIEl = document.createElement('\u0130');
  document.body.appendChild(turkishIEl);
  assert.strictEqual(matches(turkishIEl, '\u0130'), true);
  assert.strictEqual(matches(turkishIEl, '\\130'), true);
  assert.strictEqual(matches(turkishIEl, 'i'), false);
  assert.strictEqual(matches(turkishIEl, 'I'), false);
  assert.strictEqual(querySelector(document, 'i'), null);
  assert.strictEqual(querySelector(document, '\\130'), turkishIEl);
});

test('Selectors 4 § 3.2: Attribute selector case-sensitivity with i and s flags', () => {
  const { document } = parseHTML('<div data-test="\u212A" title="HELLO"></div>');
  const div = document.querySelector('div')!;

  // ASCII attribute value with 'i' flag
  assert.strictEqual(matches(div, '[title="hello" i]'), true);
  assert.strictEqual(matches(div, '[title="HELLO" s]'), true);
  assert.strictEqual(matches(div, '[title="hello" s]'), false);

  // Unicode attribute value: Kelvin sign \u212A should NOT match 'k' even with 'i' flag
  assert.strictEqual(matches(div, '[data-test="\u212A"]'), true);
  assert.strictEqual(matches(div, '[data-test="k" i]'), false);
  assert.strictEqual(matches(div, '[data-test="K" i]'), false);
});

test('Selectors 4 § 3.2: WPT selectors-case-sensitive-001.html passes 100% (3/3 subtests)', async () => {
  const wptPath = path.resolve(process.cwd(), 'submodules/web-platform-tests/css/selectors/selectors-case-sensitive-001.html');
  if (!fs.existsSync(wptPath)) {
    // Submodule not checked out (e.g. CI sparse checkout)
    return;
  }
  const result = runWptFile(wptPath);
  assert.strictEqual(result.tests.length, 3, 'Expected 3 subtests in selectors-case-sensitive-001.html');

  for (const t of result.tests) {
    await t.fn();
  }
  result.cleanup();
});
