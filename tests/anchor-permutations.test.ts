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
import test from 'node:test';
import assert from 'node:assert';
import { Parser } from '../src/parser.ts';
import { tokenize } from '../src/tokenizer.ts';
import { CSSStyleRule } from '../src/index.ts';

const anchorNames = ['', '--foo'];
const insetProperties = [
  'left', 'right', 'top', 'bottom',
  'inset-block-start', 'inset-block-end',
  'inset-inline-start', 'inset-inline-end'
];
const anchorSides = [
  'inside', 'outside', 'left', 'right', 'top', 'bottom',
  'start', 'end', 'self-start', 'self-end', 'center'
];

test('Anchor Positioning: anchor() permutations', () => {
  for (const prop of insetProperties) {
    for (const name of anchorNames) {
      for (const side of anchorSides) {
        const anchorFunc = name ? `anchor(${name} ${side})` : `anchor(${side})`;
        const css = `.target { ${prop}: ${anchorFunc}; }`;
        
        // We use a subtest for each permutation
        // Since there are many, we might want to group them or just run them
        // For now, let's just try to parse it and ensure it serializes
        const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
        const rule = stylesheet.cssRules[0] as CSSStyleRule;
        const actualValue = rule.style.getPropertyValue(prop);
        
        // Serialization might add/remove whitespace, but it should be equivalent
        assert.ok(actualValue.includes('anchor('), `Value should contain anchor() for ${css}`);
        assert.ok(actualValue.includes(side), `Value should contain side ${side} for ${css}`);
        if (name) {
          assert.ok(actualValue.includes(name), `Value should contain name ${name} for ${css}`);
        }
      }
    }
  }
});

const anchorSizeDimensions = ['width', 'height', 'block', 'inline', 'self-block', 'self-inline'];
const sizeProperties = ['width', 'height', 'inline-size', 'block-size', 'min-width', 'min-height'];

test('Anchor Positioning: anchor-size() permutations', () => {
  for (const prop of sizeProperties) {
    for (const name of anchorNames) {
      for (const dim of anchorSizeDimensions) {
        // anchor-size( [ <anchor-name> || <anchor-size-dimension> ]? , <declaration-value>? )
        // Let's try some combinations
        const combinations = [
          name && dim ? `${name} ${dim}` : (name || dim),
          name && dim ? `${dim} ${name}` : (name || dim),
        ];
        
        for (const combo of combinations) {
          if (!combo) continue;
          const anchorSizeFunc = `anchor-size(${combo})`;
          const css = `.target { ${prop}: ${anchorSizeFunc}; }`;
          
          const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
          const rule = stylesheet.cssRules[0] as CSSStyleRule;
          const actualValue = rule.style.getPropertyValue(prop);
          
          assert.ok(actualValue.includes('anchor-size('), `Value should contain anchor-size() for ${css}`);
          if (name) assert.ok(actualValue.includes(name), `Value should contain name ${name} for ${css}`);
          if (dim) assert.ok(actualValue.includes(dim), `Value should contain dimension ${dim} for ${css}`);
        }
      }
    }
  }
});

test('Anchor Positioning: anchor() with fallback', () => {
  const css = `.target { top: anchor(--foo top, 10px); }`;
  const stylesheet = new Parser(tokenize(css)).parseStyleSheet();
  const rule = stylesheet.cssRules[0] as CSSStyleRule;
  const actualValue = rule.style.getPropertyValue('top');
  assert.ok(actualValue.includes('10px'), 'Should include fallback value');
});
